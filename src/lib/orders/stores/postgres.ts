/**
 * Заказы в базе PostgreSQL (DATABASE_URL) — основное хранилище; Google Таблица остаётся копией для просмотра.
 * Всё о заказе хранится целиком (колонка data), поэтому накладную СДЭК можно создать заново по одной кнопке.
 */
import { ensureSchema } from "@/lib/db/schema";
import { sql, transaction } from "@/lib/db/pg";
import { paymentMetadataFor } from "@/lib/payments/yookassa";
import type { OrderStore } from "../store";
import { ORDER_STATUS_LABELS, type Order, type OrderPatch } from "../types";

const invoiceOf = (paymentId?: string) => /^rk-(\d+)$/.exec(paymentId ?? "")?.[1] ?? null;

export const postgresStore: OrderStore = {
  name: "postgres",

  async save(order: Order) {
    await ensureSchema();
    const ship = order.delivery.provider === "cdek" ? paymentMetadataFor(order) : null;
    const { consents, ...data } = order;
    await transaction(async (q) => {
      const r = await q(
        `insert into orders (id, created_at, status, region, name, phone, email, total, data, ship, payment_provider, payment_id, rk_invoice)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         on conflict (id) do nothing`,
        [
          order.id,
          order.createdAt,
          order.status,
          order.region,
          order.customer.name,
          order.customer.phone,
          order.customer.email,
          order.total,
          data,
          ship,
          order.payment?.provider ?? null,
          order.payment?.paymentId ?? null,
          invoiceOf(order.payment?.paymentId),
        ],
      );
      if (!r.rowCount) return; // тот же заказ ещё раз — не дублируем
      await q("insert into order_events (order_id, kind, text) values ($1, 'created', $2)", [
        order.id,
        `Заказ оформлен: ${order.quantity} шт., ${order.total} ₽ · ${order.delivery.label}`,
      ]);
      if (consents) {
        await q("insert into consents (order_id, created_at, data) values ($1, $2, $3)", [
          order.id,
          order.createdAt,
          { ...consents, name: order.customer.name, email: order.customer.email, phone: order.customer.phone, ip: order.meta?.ip ?? "", userAgent: order.meta?.userAgent ?? "" },
        ]);
      }
    });
  },

  async update(id: string, patch: OrderPatch) {
    await ensureSchema();
    await transaction(async (q) => {
      const cur = await q<{ data: Order; status: string; mail_marks: string }>(
        "select data, status, mail_marks from orders where id = $1 for update",
        [id],
      );
      const row = cur.rows[0];
      if (!row) throw new Error("order not found");
      const data: Order = { ...row.data };
      const events: [string, string][] = [];
      if (patch.status && patch.status !== row.status) {
        data.status = patch.status;
        events.push(["status", `Статус: ${ORDER_STATUS_LABELS[patch.status]}`]);
      }
      if (patch.delivery) {
        data.delivery = patch.delivery;
        const t = patch.delivery.cdek?.trackingNumber;
        if (/⚠/.test(patch.delivery.label)) events.push(["ship_error", patch.delivery.label.replace(/^.*?⚠\s*/, "")]);
        else if (t && t !== row.data.delivery?.cdek?.trackingNumber) events.push(["ship", `Накладная СДЭК № ${t}`]);
      }
      if (patch.payment) {
        data.payment = patch.payment;
        if (patch.payment.status === "succeeded" && row.data.payment?.status !== "succeeded")
          events.push(["paid", `Оплата: ${patch.payment.label || patch.payment.provider}`]);
      }
      const marks = patch.mailNote ? (row.mail_marks ? `${row.mail_marks}\n${patch.mailNote}` : patch.mailNote) : row.mail_marks;
      if (patch.mailNote) events.push(["mail", `Письмо покупателю: ${patch.mailNote}`]);
      await q(
        `update orders set data = $2, status = $3, updated_at = now(), mail_marks = $4,
           payment_provider = coalesce($5, payment_provider), payment_id = coalesce($6, payment_id),
           rk_invoice = coalesce($7, rk_invoice),
           paid_at = case when $8::boolean and paid_at is null then now() else paid_at end,
           tracking = coalesce($9, tracking)
         where id = $1`,
        [
          id,
          data,
          data.status,
          marks,
          patch.payment?.provider ?? null,
          patch.payment?.paymentId ?? null,
          invoiceOf(patch.payment?.paymentId),
          patch.payment?.status === "succeeded" || patch.status === "paid",
          patch.delivery?.cdek?.trackingNumber ?? null,
        ],
      );
      for (const [kind, text] of events) {
        await q("insert into order_events (order_id, kind, text) values ($1, $2, $3)", [id, kind, text.slice(0, 1000)]);
      }
    });
  },
};

/** Запись в историю заказа (не мешает работе, если база недоступна) */
export async function logOrderEvent(orderId: string, kind: string, text: string): Promise<void> {
  try {
    await ensureSchema();
    await sql("insert into order_events (order_id, kind, text) values ($1, $2, $3)", [orderId, kind, text.slice(0, 1000)]);
  } catch (err) {
    console.error("[db] Не удалось записать историю заказа:", (err as Error).message);
  }
}
