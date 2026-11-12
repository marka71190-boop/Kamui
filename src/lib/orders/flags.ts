/**
 * Пометки продавца на заказах (в базе, таблица order_flags):
 *   скрыт — не показывать на странице накладных (например, отправку оформили сами);
 *   накладная вручную — номер СДЭК отправления, оформленного в личном кабинете: по нему сайт следит
 *   за посылкой, пишет покупателю трек-номер и напоминает о сроке хранения.
 */
import { sql } from "@/lib/db/pg";
import { dbEnabled, ensureSchema } from "@/lib/db/schema";
import { findShipment, findShipmentByNumber, type CdekShipmentRef } from "@/lib/delivery/cdek";

export interface OrderFlags {
  hidden: boolean;
  manualTracking: string | null;
  /** Когда сборщик отметил «Собрал» (null — не собран) */
  packedAt: string | null;
}

export async function orderFlags(): Promise<Map<string, OrderFlags>> {
  const out = new Map<string, OrderFlags>();
  if (!dbEnabled()) return out;
  await ensureSchema();
  const r = await sql<{ order_id: string; hidden: boolean; manual_tracking: string | null; packed_at: string | null }>(
    "select order_id, hidden, manual_tracking, packed_at from order_flags",
  );
  for (const f of r.rows) out.set(f.order_id, { hidden: f.hidden, manualTracking: f.manual_tracking, packedAt: f.packed_at });
  return out;
}

export async function setHidden(orderId: string, hidden: boolean): Promise<void> {
  await ensureSchema();
  await sql(
    `insert into order_flags (order_id, hidden) values ($1, $2)
     on conflict (order_id) do update set hidden = excluded.hidden, updated_at = now()`,
    [orderId, hidden],
  );
}

export async function setManualTracking(orderId: string, number: string): Promise<void> {
  await ensureSchema();
  await sql(
    `insert into order_flags (order_id, manual_tracking) values ($1, $2)
     on conflict (order_id) do update set manual_tracking = excluded.manual_tracking, updated_at = now()`,
    [orderId, number],
  );
}

/** Сборщик собрал заказ (или снял отметку) */
export async function setPacked(orderId: string, packed: boolean): Promise<void> {
  await ensureSchema();
  await sql(
    `insert into order_flags (order_id, packed_at) values ($1, case when $2::boolean then now() end)
     on conflict (order_id) do update set packed_at = case when $2::boolean then now() end, updated_at = now()`,
    [orderId, packed],
  );
}

/** Номер накладной, оформленной вручную (null — нет базы или номера) */
export async function manualTrackingFor(orderId: string): Promise<string | null> {
  if (!dbEnabled()) return null;
  try {
    await ensureSchema();
    return (await sql<{ m: string | null }>("select manual_tracking as m from order_flags where order_id = $1", [orderId])).rows[0]?.m ?? null;
  } catch {
    return null;
  }
}

/**
 * Отправление СДЭК по заказу: созданное сайтом (номер заказа в СДЭК = номер заказа сайта)
 * или оформленное вручную (по номеру накладной, который указал продавец).
 */
export async function shipmentFor(orderId: string, manual?: string | null): Promise<CdekShipmentRef | null> {
  const own = await findShipment(orderId);
  if (own) return own;
  const number = manual === undefined ? await manualTrackingFor(orderId) : manual;
  if (!number) return null;
  const s = await findShipmentByNumber(number).catch(() => null);
  return s ?? { uuid: "", trackingNumber: number, status: "оформлена вручную" };
}
