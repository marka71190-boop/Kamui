/**
 * POST /api/payments/yookassa/webhook — уведомления ЮKassa о статусе платежа.
 * Укажите этот адрес в личном кабинете ЮKassa: Интеграция → HTTP-уведомления,
 * события payment.succeeded и payment.canceled.
 *
 * Уведомление не подписано, поэтому статус всегда перепроверяется запросом к API ЮKassa.
 */
import { features } from "@/config/features";
import { json } from "@/lib/http";
import { updateOrder } from "@/lib/orders/store";
import type { OrderStatus } from "@/lib/orders/types";
import { getPayment, type YooKassaNotification } from "@/lib/payments/yookassa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_MAP: Partial<Record<string, OrderStatus>> = {
  succeeded: "paid",
  canceled: "payment_canceled",
  pending: "awaiting_payment",
  waiting_for_capture: "awaiting_payment",
};

export async function POST(request: Request) {
  if (!features.payments) return json({ ok: false, error: "Оплата не подключена" }, 404);

  let body: YooKassaNotification;
  try {
    body = (await request.json()) as YooKassaNotification;
  } catch {
    return json({ ok: false }, 400);
  }
  if (body?.type !== "notification" || !body.object?.id) return json({ ok: false }, 400);

  try {
    const payment = await getPayment(body.object.id);
    const orderId = payment.metadata?.orderId;
    if (!orderId) return json({ ok: true, skipped: "no orderId" });

    await updateOrder(orderId, {
      status: STATUS_MAP[payment.status],
      payment: {
        provider: "yookassa",
        paymentId: payment.id,
        status: payment.status,
        paidAt: payment.status === "succeeded" ? (payment.captured_at ?? new Date().toISOString()) : undefined,
      },
    });
    return json({ ok: true });
  } catch (err) {
    console.error("[yookassa] Ошибка обработки уведомления:", err);
    // 500 → ЮKassa повторит уведомление позже
    return json({ ok: false }, 500);
  }
}
