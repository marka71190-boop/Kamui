/**
 * Перенос старых заказов в базу: оплаты ЮKassa (в них есть всё для накладной) + Google Таблица
 * (заказы Robokassa, ждущие оплаты, международные, отметки о письмах покупателю).
 *
 * Запускается сам один раз, когда база подключена впервые, и кнопкой на странице /cdek-orders.
 * Можно запускать сколько угодно раз: заказы, оформленные уже с базой, не трогает; перенесённые раньше —
 * обновляет (статус, отметки о письмах) по свежим данным таблицы.
 */
import { features } from "@/config/features";
import { fetchSheetOverview, robokassaInvoiceFrom, type SheetPaidOrder } from "@/lib/orders/stores/google-sheets";
import { ORDER_STATUS_LABELS, type Order, type OrderStatus } from "@/lib/orders/types";
import { listPaidSiteOrders, type PaymentShipmentMeta, type YooKassaPayment } from "@/lib/payments/yookassa";
import { sql } from "./pg";
import { ensureSchema } from "./schema";

export interface ImportReport {
  imported: number;
  updated: number;
  /** Таблица не отдала заказы (старый скрипт) — перенесены только оплаты ЮKassa */
  sheetMissing: boolean;
  errors: string[];
}

const STATUS_BY_LABEL = Object.fromEntries(Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => [v, k])) as Record<string, OrderStatus>;
export const NO_MARKS = "импорт без отметок о письмах";

function orderFrom(o: { id: string; createdAt: string; status: OrderStatus; region: "ru" | "intl" }, s: SheetPaidOrder | undefined, p: YooKassaPayment | undefined): Order {
  const m = (p?.metadata ?? {}) as Partial<PaymentShipmentMeta>;
  const qty = s?.quantity || Number(m.qty) || 1;
  const total = s?.total || Number(p?.amount.value) || 0;
  const label = s?.delivery || m.delivery || (m.pvz ? `СДЭК ПВЗ ${m.pvz}` : "");
  const invoice = robokassaInvoiceFrom(s?.payment);
  return {
    id: o.id,
    createdAt: o.createdAt,
    status: o.status,
    region: o.region,
    customer: { name: s?.name || m.name || "", phone: s?.phone || m.phone || "", email: s?.email || m.email || "", ...(m.tin ? { taxId: m.tin } : {}) },
    address: { country: "", city: s?.city || "" },
    ...(m.kit ? { product: "kit" as const, tip: m.kit } : /^Подарочный набор/.test(s?.comment ?? "") ? { product: "kit" as const } : {}),
    quantity: qty,
    unitPrice: Number(m.price) || Math.round(total / qty),
    itemsTotal: total,
    deliveryCost: 0,
    total,
    currency: "RUB",
    comment: s?.comment ?? "",
    // данные ПВЗ для накладной — только из ЮKassa (там они полные); для Robokassa — из счёта Robokassa
    delivery: m.pvz
      ? { provider: "cdek", label, cdek: { pickupPointCode: m.pvz, ...(m.tariff ? { tariffCode: Number(m.tariff) } : {}), ...(m.cc ? { countryCode: m.cc } : {}) } }
      : { provider: o.region === "intl" ? "international" : "cdek", label },
    ...(p
      ? { payment: { provider: "yookassa" as const, paymentId: p.id, status: "succeeded" as const, paidAt: p.captured_at ?? p.created_at } }
      : invoice
        ? { payment: { provider: "robokassa" as const, paymentId: `rk-${invoice}`, status: /оплачено/.test(s?.payment ?? "") ? ("succeeded" as const) : ("pending" as const), label: s?.payment } }
        : {}),
  };
}

let running: Promise<ImportReport> | null = null;

export function importOldOrders(): Promise<ImportReport> {
  running ??= run().finally(() => {
    running = null;
  });
  return running;
}

async function run(): Promise<ImportReport> {
  await ensureSchema();
  const r: ImportReport = { imported: 0, updated: 0, sheetMissing: false, errors: [] };
  const [ykRes, sheetRes] = await Promise.allSettled([
    features.payments ? listPaidSiteOrders(90) : Promise.resolve([] as YooKassaPayment[]),
    fetchSheetOverview(90, true),
  ]);
  const yk = ykRes.status === "fulfilled" ? ykRes.value : [];
  if (ykRes.status === "rejected") r.errors.push(`ЮKassa: ${(ykRes.reason as Error).message}`);
  const sheet = sheetRes.status === "fulfilled" ? sheetRes.value : null;
  if (sheetRes.status === "rejected") r.errors.push(`Таблица: ${(sheetRes.reason as Error).message}`);
  r.sheetMissing = !sheet;

  const sheetRows = new Map<string, { row: SheetPaidOrder; region: "ru" | "intl"; fallback: OrderStatus }>();
  for (const row of sheet?.paid ?? []) sheetRows.set(row.id, { row, region: "ru", fallback: "paid" });
  for (const row of sheet?.awaiting ?? []) sheetRows.set(row.id, { row, region: "ru", fallback: "awaiting_payment" });
  for (const row of sheet?.intl ?? []) sheetRows.set(row.id, { row, region: "intl", fallback: "new" });
  const byPayment = new Map(yk.map((p) => [p.metadata?.orderId ?? "", p]));
  const ids = new Set([...byPayment.keys(), ...sheetRows.keys()].filter(Boolean));

  for (const id of ids) {
    const p = byPayment.get(id);
    const s = sheetRows.get(id);
    const status: OrderStatus = (s && STATUS_BY_LABEL[s.row.status ?? ""]) || s?.fallback || "paid";
    const createdAt = s?.row.createdAt || p?.created_at || new Date().toISOString();
    const order = orderFrom({ id, createdAt, status, region: s?.region ?? "ru" }, s?.row, p);
    // отметки о письмах: из таблицы; если заказа в таблице не видно — не знаем, что уходило, письма сами не шлём
    const marks = s ? s.row.mailMarks ?? "" : NO_MARKS;
    const ship = p?.metadata?.pvz ? { ...(p.metadata as unknown as PaymentShipmentMeta), orderId: id } : null;
    const tracking = /трек\s*(\d{6,})/.exec(order.delivery.label)?.[1] ?? null;
    try {
      const res = await sql<{ inserted: boolean }>(
        `insert into orders (id, created_at, status, region, name, phone, email, total, data, ship, payment_provider, payment_id,
                             rk_invoice, paid_at, tracking, mail_marks, source)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'import')
         on conflict (id) do update set status = excluded.status, data = excluded.data, ship = coalesce(excluded.ship, orders.ship),
           mail_marks = case when excluded.mail_marks = $17 then orders.mail_marks else excluded.mail_marks end,
           tracking = coalesce(excluded.tracking, orders.tracking), rk_invoice = coalesce(excluded.rk_invoice, orders.rk_invoice),
           updated_at = now()
         where orders.source = 'import'
         returning (xmax = 0) as inserted`,
        [
          id,
          createdAt,
          status,
          order.region,
          order.customer.name,
          order.customer.phone,
          order.customer.email,
          order.total,
          order,
          ship,
          order.payment?.provider ?? null,
          order.payment?.paymentId ?? null,
          robokassaInvoiceFrom(s?.row.payment),
          order.payment?.status === "succeeded" ? (order.payment.paidAt ?? createdAt) : null,
          tracking,
          marks,
          NO_MARKS,
        ],
      );
      if (res.rows[0]?.inserted) r.imported++;
      else if (res.rows.length) r.updated++;
    } catch (err) {
      r.errors.push(`${id}: ${(err as Error).message}`);
    }
  }
  await sql(
    "insert into settings (key, value) values ('imported_at', $1) on conflict (key) do update set value = excluded.value, updated_at = now()",
    [new Date().toISOString()],
  );
  console.log(`[db] Перенос заказов: новых ${r.imported}, обновлено ${r.updated}${r.sheetMissing ? ", таблица не отдала заказы" : ""}`);
  return r;
}

/** Переносили ли уже заказы (чтобы при первом подключении базы перенести их автоматически) */
export async function importedAt(): Promise<string | null> {
  await ensureSchema();
  return (await sql<{ value: string }>("select value from settings where key = 'imported_at'")).rows[0]?.value ?? null;
}
