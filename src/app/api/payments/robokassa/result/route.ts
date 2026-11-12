/**
 * Result URL Robokassa — уведомление об успешной оплате (сервер Robokassa → сайт).
 * Укажите в личном кабинете Robokassa: Мои магазины → Технические настройки →
 *   Result URL: https://kamui-collection.ru/api/payments/robokassa/result, метод POST.
 *
 * Подпись проверяется паролем №2. Ответ «OK<номер счёта>» — Robokassa перестаёт повторять уведомление.
 * После ответа: заказ в таблице → «Оплачена», создаётся накладная СДЭК (повторное уведомление дубль не создаст).
 */
import { after } from "next/server";
import { features } from "@/config/features";
import { ORDER_ID_RE } from "@/lib/orders/id";
import { readParams, verifyResult } from "@/lib/payments/robokassa";
import { markRobokassaPaid } from "@/lib/payments/robokassa-paid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

async function handle(request: Request): Promise<Response> {
  if (!features.robokassa) return text("robokassa is not configured", 404);
  const params = await readParams(request);
  const cb = verifyResult(params);
  if (!cb) {
    console.error("[robokassa] Неверная подпись уведомления, счёт", params.InvId ?? "?");
    return text("bad sign", 400);
  }
  if (!ORDER_ID_RE.test(cb.orderId)) {
    // Платёж не с этого сайта (например, счёт, выставленный вручную в личном кабинете)
    return text(`OK${cb.invoiceId}`);
  }

  const { saved, followUp } = await markRobokassaPaid(cb);
  // Письмо покупателю и накладная СДЭК — после ответа Robokassa (повторное уведомление дублей не создаст)
  if (!cb.test) after(() => followUp().then(() => undefined));
  return saved ? text(`OK${cb.invoiceId}`) : text("retry later", 500);
}

export const POST = handle;
export const GET = handle;
