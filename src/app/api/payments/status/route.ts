/**
 * GET /api/payments/status?order=KA-260925-AB12[&payment=<id>] — статус оплаты заказа.
 * Нужен странице, на которую покупатель возвращается после оплаты. Отдаёт только статус, без личных данных.
 * payment=rk-<номер счёта> — оплата через Robokassa, иначе — ЮKassa.
 */
import { features } from "@/config/features";
import { clientIp, createRateLimiter, json } from "@/lib/http";
import { ORDER_ID_RE } from "@/lib/orders/id";
import { getRobokassaState, robokassaConfig } from "@/lib/payments/robokassa";
import { findPaymentForOrder, getPayment, type YooKassaPayment } from "@/lib/payments/yookassa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rateLimit = createRateLimiter({ limit: 40, windowMs: 10 * 60 * 1000 });

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const orderId = params.get("order") ?? "";
  const paymentId = params.get("payment") ?? "";
  const robokassaInvoice = paymentId.match(/^rk-(\d{1,19})$/)?.[1];
  if (robokassaInvoice ? !features.robokassa : !features.payments)
    return json({ ok: false, error: "Оплата не подключена" }, 404);
  if (!rateLimit(clientIp(request)).ok) return json({ ok: false, error: "Слишком много запросов" }, 429);
  if (!ORDER_ID_RE.test(orderId)) return json({ ok: false, error: "Некорректный номер заказа" }, 400);

  if (robokassaInvoice) {
    try {
      const st = await getRobokassaState(robokassaInvoice);
      // Счёт не найден — покупатель ушёл со страницы оплаты, не начав платить.
      // Тестовые платежи этот интерфейс не показывает вовсе — тогда статус неизвестен.
      if (!st.found) {
        const test = robokassaConfig()?.test;
        return json({ ok: true, provider: "robokassa", status: st.resultCode === 3 && !test ? "canceled" : "unknown" });
      }
      if (st.orderId && st.orderId !== orderId) return json({ ok: true, provider: "robokassa", status: "unknown" });
      return json({ ok: true, provider: "robokassa", status: st.status, ...(st.outSum ? { amount: st.outSum } : {}) });
    } catch (err) {
      console.error("[payments] robokassa status:", err);
      return json({ ok: false, error: "Не удалось проверить оплату" }, 502);
    }
  }

  try {
    let payment: YooKassaPayment | null = null;
    if (/^[\w-]{10,60}$/.test(paymentId)) {
      const p = await getPayment(paymentId).catch(() => null);
      if (p?.metadata?.orderId === orderId) payment = p;
    }
    payment ??= await findPaymentForOrder(orderId);
    if (!payment) return json({ ok: true, status: "unknown" });
    return json({
      ok: true,
      status: payment.status,
      amount: Number(payment.amount.value),
      ...(payment.status === "pending" && payment.confirmation?.confirmation_url
        ? { paymentUrl: payment.confirmation.confirmation_url }
        : {}),
    });
  } catch (err) {
    console.error("[payments] status:", err);
    return json({ ok: false, error: "Не удалось проверить оплату" }, 502);
  }
}
