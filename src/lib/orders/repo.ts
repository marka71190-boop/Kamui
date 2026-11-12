/**
 * Чтение заказов для служебной страницы, писем и проверок.
 * Есть база (DATABASE_URL) — из базы; нет — как раньше, из Google Таблицы.
 * Вид записи один и тот же (SheetPaidOrder), поэтому остальной код не знает, откуда заказы.
 */
import { sql } from "@/lib/db/pg";
import { dbEnabled, ensureSchema } from "@/lib/db/schema";
import { paymentMetadataFor, type PaymentShipmentMeta } from "@/lib/payments/yookassa";
import { fetchSheetOverview, paymentLabel, type SheetOverview, type SheetPaidOrder } from "./stores/google-sheets";
import { ORDER_STATUS_LABELS, type Order, type OrderStatus } from "./types";

export interface DbOrderRow {
  id: string;
  created_at: string;
  status: OrderStatus;
  region: string;
  name: string;
  phone: string;
  email: string;
  total: number;
  data: Order;
  ship: PaymentShipmentMeta | null;
  rk_invoice: string | null;
  paid_at: string | null;
  tracking: string | null;
  mail_marks: string;
  source: string;
}

function place(o: Order): string {
  const a = o.address ?? { country: "", city: "" };
  return o.region === "intl" ? [a.country, a.city, a.address].filter(Boolean).join(", ") : a.city || "";
}

/** Строка базы → тот же вид, что строка таблицы */
export function rowToSheetShape(r: DbOrderRow): SheetPaidOrder {
  const d = r.data;
  return {
    id: r.id,
    createdAt: r.created_at,
    status: ORDER_STATUS_LABELS[r.status] ?? r.status,
    name: r.name,
    phone: r.phone,
    email: r.email,
    quantity: Number(d.quantity) || 0,
    total: Number(r.total) || 0,
    city: place(d),
    delivery: d.delivery?.label ?? "",
    comment: d.comment ?? "",
    mailMarks: r.mail_marks ?? "",
    payment: paymentLabel(d),
  };
}

const COLS = "id, created_at, status, region, name, phone, email, total, data, ship, rk_invoice, paid_at, tracking, mail_marks, source";

async function dbOverview(days: number, extra: boolean): Promise<SheetOverview> {
  await ensureSchema();
  const d = Math.min(90, Math.max(1, days));
  const paid = await sql<DbOrderRow>(
    `select ${COLS} from orders where region = 'ru' and status in ('paid','shipped','delivered')
       and created_at >= now() - make_interval(days => $1) order by created_at desc`,
    [d],
  );
  if (!extra) return { paid: paid.rows.map(rowToSheetShape), awaiting: null, intl: null };
  const [awaiting, intl] = await Promise.all([
    sql<DbOrderRow>(
      `select ${COLS} from orders where status in ('awaiting_payment','new','payment_canceled') and rk_invoice is not null
         and created_at >= now() - make_interval(days => $1) order by created_at desc`,
      [Math.min(d, 30)],
    ),
    sql<DbOrderRow>(
      `select ${COLS} from orders where region = 'intl' and status not in ('cancelled','payment_canceled')
         and created_at >= now() - make_interval(days => $1) order by created_at desc`,
      [d],
    ),
  ]);
  return { paid: paid.rows.map(rowToSheetShape), awaiting: awaiting.rows.map(rowToSheetShape), intl: intl.rows.map(rowToSheetShape) };
}

/** Оплаченные заказы, ждущие оплаты в Robokassa, международные. null — нет ни базы, ни таблицы (или скрипт таблицы старый). */
export function ordersOverview(days: number, extra = true): Promise<SheetOverview | null> {
  return dbEnabled() ? dbOverview(days, extra) : fetchSheetOverview(days, extra);
}

/** Данные для накладной СДЭК из базы (null — базы нет или заказ не найден) */
export async function shipMetaFor(orderId: string): Promise<PaymentShipmentMeta | null> {
  if (!dbEnabled()) return null;
  await ensureSchema();
  const r = (await sql<Pick<DbOrderRow, "data" | "ship">>("select data, ship from orders where id = $1", [orderId])).rows[0];
  if (!r) return null;
  if (r.ship?.pvz) return { ...r.ship, orderId };
  if (r.data?.delivery?.cdek?.pickupPointCode) return paymentMetadataFor(r.data);
  return derivedMeta(orderId, r.data);
}

const COUNTRY_CODES: [RegExp, string][] = [
  [/беларус|belarus/i, "BY"],
  [/казахстан|kazakhstan/i, "KZ"],
  [/армени|armenia/i, "AM"],
  [/кыргыз|киргиз|kyrgyz/i, "KG"],
];

/**
 * Данные для накладной из того, что есть в заказе (для старых заказов, перенесённых из таблицы):
 * ПВЗ — из текста «СДЭК ПВЗ MIN31 · …», страна — из адреса, ИИН/ПИН — из комментария.
 */
export function derivedMeta(orderId: string, d: Order | undefined): PaymentShipmentMeta | null {
  if (!d) return null;
  const label = d.delivery?.label ?? "";
  const pvz = /СДЭК ПВЗ\s+([A-Za-z0-9_-]+)/.exec(label)?.[1];
  const where = `${d.address?.country ?? ""} ${d.address?.city ?? ""} ${label}`;
  const cc = COUNTRY_CODES.find(([re]) => re.test(where))?.[1];
  const tin = /(?:ИИН|ПИН) получателя:\s*(\d{6,})/.exec(d.comment ?? "")?.[1];
  const kit = d.product === "kit" ? d.tip || /наклейка JOS\s+(\S+)/.exec(d.comment ?? "")?.[1] || "-" : undefined;
  const qty = Number(d.quantity) || 1;
  return {
    orderId,
    qty: String(qty),
    price: String(Number(d.unitPrice) || Math.round((Number(d.total) || 0) / qty)),
    name: d.customer?.name ?? "",
    phone: d.customer?.phone ?? "",
    email: d.customer?.email ?? "",
    ...(pvz ? { pvz, delivery: label.replace(/ · трек .*$/, "").replace(/ · ⚠.*$/, "") } : {}),
    ...(cc ? { cc } : {}),
    ...(tin ? { tin } : {}),
    ...(kit ? { kit } : {}),
  };
}

/** Заказ по номеру счёта Robokassa (база, иначе таблица) */
export async function orderIdByInvoice(invoice: string): Promise<string | null> {
  if (dbEnabled()) {
    await ensureSchema();
    const r = (await sql<{ id: string }>("select id from orders where rk_invoice = $1 order by created_at desc limit 1", [invoice])).rows[0];
    if (r) return r.id;
  }
  const ov = await ordersOverview(60, true).catch(() => null);
  const all = [...(ov?.paid ?? []), ...(ov?.awaiting ?? [])];
  return all.find((o) => new RegExp(`сч[её]т\\s*${invoice}\\b`).test(o.payment ?? ""))?.id ?? null;
}

/** Отметки о письмах покупателю из базы ("" — нет; null — базы нет или заказа нет в ней) */
export async function mailMarksFor(orderId: string): Promise<string | null> {
  if (!dbEnabled()) return null;
  await ensureSchema();
  return (await sql<{ m: string }>("select mail_marks as m from orders where id = $1", [orderId])).rows[0]?.m ?? null;
}

/** История заказа для страницы */
export async function orderEvents(orderIds: string[]): Promise<Map<string, { at: string; kind: string; text: string }[]>> {
  const out = new Map<string, { at: string; kind: string; text: string }[]>();
  if (!dbEnabled() || !orderIds.length) return out;
  await ensureSchema();
  const r = await sql<{ order_id: string; at: string; kind: string; text: string }>(
    "select order_id, at, kind, text from order_events where order_id = any($1::text[]) order by at",
    [`{${orderIds.map((id) => `"${id.replace(/["\\]/g, "")}"`).join(",")}}`],
  );
  for (const e of r.rows) {
    const list = out.get(e.order_id) ?? [];
    list.push({ at: e.at, kind: e.kind, text: e.text });
    out.set(e.order_id, list);
  }
  return out;
}
