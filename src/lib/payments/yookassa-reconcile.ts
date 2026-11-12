/**
 * Сверка оплат ЮKassa: если уведомление об оплате до сайта не дошло (в личном кабинете ЮKassa не указан
 * или указан неверно адрес HTTP-уведомлений), заказ остался бы «Ожидает оплаты» — без письма покупателю.
 * Сайт сам смотрит успешные платежи ЮKassa за последние дни и доводит такие заказы до конца:
 * «Оплачена», письмо «Спасибо за заказ», накладная СДЭК (если её ещё нет).
 *
 * Запускается раз в 30 минут и при открытии страницы /cdek-orders. Нужна база (DATABASE_URL).
 */
import { features } from "@/config/features";
import type { ShipResult } from "@/lib/delivery/ship";
import { sql } from "@/lib/db/pg";
import { dbEnabled, ensureSchema } from "@/lib/db/schema";
import { listPaidSiteOrders } from "./yookassa";
import { applyYooKassaPayment } from "./yookassa-paid";

export interface YooKassaReconcile {
  fixed: { orderId: string; ship?: ShipResult }[];
  errors: string[];
}

let running: Promise<YooKassaReconcile> | null = null;

export function reconcileYooKassa(days = 3): Promise<YooKassaReconcile> {
  running ??= run(days).finally(() => {
    running = null;
  });
  return running;
}

async function run(days: number): Promise<YooKassaReconcile> {
  const r: YooKassaReconcile = { fixed: [], errors: [] };
  if (!dbEnabled() || !features.payments) return r;
  await ensureSchema();
  const payments = await listPaidSiteOrders(days);
  if (!payments.length) return r;
  const ids = payments.map((p) => p.metadata?.orderId ?? "").filter(Boolean);
  const rows = await sql<{ id: string; status: string }>("select id, status from orders where id = any($1::text[])", [
    `{${ids.map((id) => `"${id.replace(/["\\]/g, "")}"`).join(",")}}`,
  ]);
  const status = new Map(rows.rows.map((x) => [x.id, x.status]));
  for (const p of payments) {
    const id = p.metadata?.orderId ?? "";
    const st = status.get(id);
    // заказа нет в базе (оформлен до её подключения) или уже оплачен/отправлен — ничего не делаем
    if (!st || ["paid", "shipped", "delivered"].includes(st)) continue;
    try {
      const { followUp } = await applyYooKassaPayment(p);
      const { ship } = await followUp();
      r.fixed.push({ orderId: id, ...(ship ? { ship } : {}) });
      console.log(`[yookassa] Сверка: заказ ${id} оплачен, а уведомление ЮKassa не приходило — отмечен оплаченным`);
    } catch (err) {
      r.errors.push(`${id}: ${(err as Error).message}`);
    }
  }
  return r;
}
