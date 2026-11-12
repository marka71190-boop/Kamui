/**
 * Подстраховка автоматических накладных: если после оплаты накладная СДЭК не появилась
 * (уведомление об оплате не дошло, СДЭК был недоступен), проверка раз в 30 минут создаёт её сама.
 *
 * Только для свежих оплат (по умолчанию 6 часов, AUTO_SHIP_RETRY_HOURS) и не больше 3 попыток на заказ —
 * чтобы не создать дубль, если менеджер уже оформил отправление вручную в личном кабинете СДЭК.
 * Заказы постарше — кнопкой «Создать накладную» на странице /cdek-orders.
 */
import { features } from "@/config/features";
import { dbEnabled } from "@/lib/db/schema";
import { shipMetaFor } from "@/lib/orders/repo";
import { robokassaInvoiceFrom, type SheetPaidOrder } from "@/lib/orders/stores/google-sheets";
import { getRobokassaState } from "@/lib/payments/robokassa";
import { listPaidSiteOrders } from "@/lib/payments/yookassa";
import { orderFlags, shipmentFor } from "@/lib/orders/flags";
import { shipOrder, shipPaidOrder } from "./ship";

const attempts = new Map<string, number>();
const MAX_ATTEMPTS = 3;

const retryHours = () => {
  const n = Number(process.env.AUTO_SHIP_RETRY_HOURS);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 72) : 6;
};

export interface AutoShipReport {
  created: string[];
  errors: string[];
}

/** Накладная для заказа из базы или оплаты через Robokassa (данные для СДЭК — из базы или из счёта Robokassa) */
export async function shipRobokassaOrder(o: Pick<SheetPaidOrder, "id" | "payment">, retryRejected = false) {
  const fromDb = await shipMetaFor(o.id).catch(() => null);
  if (fromDb?.pvz) return shipOrder(fromDb, { retryRejected });
  const invoice = robokassaInvoiceFrom(o.payment);
  if (!invoice) return { ok: false as const, error: "в колонке «Платёж» нет номера счёта Robokassa" };
  const st = await getRobokassaState(invoice);
  if (!st.found) return { ok: false as const, error: `Robokassa не нашла счёт ${invoice} (код ${st.resultCode})` };
  if (st.status !== "succeeded" && st.code !== 50) return { ok: false as const, error: `счёт ${invoice} в Robokassa не оплачен` };
  if (!st.meta?.pvz) return { ok: false as const, error: `в счёте ${invoice} нет данных о пункте выдачи СДЭК` };
  return shipOrder({ ...st.meta, orderId: o.id }, { retryRejected });
}

async function tryShip(orderId: string, make: () => Promise<{ ok: boolean; error?: string }>, r: AutoShipReport, skip: Set<string>) {
  const n = attempts.get(orderId) ?? 0;
  if (n >= MAX_ATTEMPTS || skip.has(orderId)) return;
  if (await shipmentFor(orderId, null)) return;
  attempts.set(orderId, n + 1);
  const res = await make();
  if (res.ok) r.created.push(orderId);
  else r.errors.push(`${orderId}: ${res.error}`);
}

export async function shipMissing(sheetPaid: SheetPaidOrder[] | null): Promise<AutoShipReport> {
  const r: AutoShipReport = { created: [], errors: [] };
  if (!features.cdek || !features.cdekAutoShipment) return r;
  const since = Date.now() - retryHours() * 3600 * 1000;
  const known = new Set<string>();
  // скрытые продавцом и с накладной, оформленной вручную, — не трогаем
  const skip = new Set<string>();
  for (const [id, f] of await orderFlags().catch(() => new Map())) if (f.hidden || f.manualTracking) skip.add(id);

  if (features.payments) {
    const paid = await listPaidSiteOrders(1).catch(() => []);
    for (const p of paid) {
      const id = p.metadata?.orderId ?? "";
      known.add(id);
      if (!p.metadata?.pvz || Date.parse(p.captured_at ?? p.created_at) < since) continue;
      await tryShip(id, () => shipPaidOrder(p), r, skip).catch((err) => r.errors.push(`${id}: ${(err as Error).message}`));
    }
  }
  for (const o of sheetPaid ?? []) {
    if (known.has(o.id) || !/^СДЭК ПВЗ/.test(o.delivery)) continue;
    if (!dbEnabled() && !robokassaInvoiceFrom(o.payment)) continue;
    if ((Date.parse(o.createdAt) || 0) < since) continue;
    await tryShip(o.id, () => shipRobokassaOrder(o), r, skip).catch((err) => r.errors.push(`${o.id}: ${(err as Error).message}`));
  }
  return r;
}
