/**
 * POST /api/payments/yookassa/webhook — уведомления ЮKassa о статусе платежа.
 * Укажите этот адрес в личном кабинете ЮKassa: Интеграция → HTTP-уведомления,
 * события payment.succeeded и payment.canceled.
 *
 * Уведомление не подписано, поэтому статус всегда перепроверяется запросом к API ЮKassa.
 * После оплаты (если подключён СДЭК) создаётся отправление — уже после ответа ЮKassa.
 */
import { after } from "next/server";
import { features } from "@/config/features";
import { json } from "@/lib/http";
import { getPayment, type YooKassaNotification } from "@/lib/payments/yookassa";
import { applyYooKassaPayment } from "@/lib/payments/yookassa-paid";
import { setSetting } from "@/lib/db/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!features.payments) return json({ ok: false, error: "Оплата не подключена" }, 404);

  let body: YooKassaNotification;
  try {
    body = (await request.json()) as YooKassaNotification;
  } catch {
    return json({ ok: false }, 400);
  }
  if (body?.type !== "notification" || !body.object?.id) return json({ ok: false }, 400);
  // Возвраты и прочие события пока не обрабатываем
  if (body.event && !body.event.startsWith("payment.")) return json({ ok: true, skipped: body.event });

  try {
    const payment = await getPayment(body.object.id);
    const orderId = payment.metadata?.orderId;
    if (!orderId) return json({ ok: true, skipped: "no orderId" });

    const { followUp } = await applyYooKassaPayment(payment);
    // для страницы /cdek-orders: уведомления ЮKassa доходят
    await setSetting("yookassa_webhook_at", new Date().toISOString());
    // После ответа ЮKassa: письмо «Спасибо за заказ», потом накладная СДЭК
    if (payment.status === "succeeded" && !payment.test) after(() => followUp().then(() => undefined));
    return json({ ok: true });
  } catch (err) {
    console.error("[yookassa] Ошибка обработки уведомления:", err);
    // 500 → ЮKassa повторит уведомление позже
    return json({ ok: false }, 500);
  }
}
