/**
 * POST /api/orders — приём заявки.
 * Проверяет форму и остаток, создаёт номер заказа, сохраняет заявку
 * (локальный файл + Google Таблица) и, если включена ЮKassa, создаёт платёж.
 */
import { features } from "@/config/features";
import { PRODUCT } from "@/config/site";
import { clientIp, createRateLimiter, json } from "@/lib/http";
import { createOrder } from "@/lib/orders/create";
import { OrderStorageError, updateOrder } from "@/lib/orders/store";
import { normalizeOrderInput, validateOrderInput } from "@/lib/orders/validation";
import { createPayment } from "@/lib/payments/yookassa";
import { getStock } from "@/lib/stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rateLimit = createRateLimiter({ limit: 5, windowMs: 10 * 60 * 1000 });

export async function POST(request: Request) {
  const ip = clientIp(request);
  const limited = rateLimit(ip);
  if (!limited.ok) {
    return json({ ok: false, error: "Слишком много заявок подряд. Попробуйте через несколько минут." }, 429, {
      "Retry-After": String(limited.retryAfter),
    });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, error: "Некорректный запрос" }, 400);
  }

  const input = normalizeOrderInput(raw);

  // Бот заполнил скрытое поле — делаем вид, что всё хорошо, но ничего не сохраняем.
  if (input.company) return json({ ok: true, orderId: "KA-000000-0000" }, 201);

  const stock = await getStock({ fresh: true });
  const maxQuantity = Math.min(PRODUCT.maxPerOrder, stock.remaining);
  const errors = validateOrderInput(input, { maxQuantity });
  if (Object.keys(errors).length > 0) {
    const status = errors.quantity && stock.remaining < input.quantity ? 409 : 400;
    return json({ ok: false, error: "Проверьте поля формы", fieldErrors: errors }, status);
  }

  try {
    const order = await createOrder(input, {
      ip,
      userAgent: request.headers.get("user-agent")?.slice(0, 200) ?? undefined,
    });

    if (features.payments) {
      try {
        const payment = await createPayment(order);
        await updateOrder(order.id, {
          payment: {
            provider: "yookassa",
            paymentId: payment.paymentId,
            status: payment.status,
            confirmationUrl: payment.confirmationUrl,
          },
        });
        return json({ ok: true, orderId: order.id, paymentUrl: payment.confirmationUrl }, 201);
      } catch (err) {
        // Заявка уже сохранена — менеджер свяжется и выставит оплату вручную.
        console.error(`[orders] Не удалось создать платёж для ${order.id}:`, err);
      }
    }

    return json({ ok: true, orderId: order.id }, 201);
  } catch (err) {
    if (!(err instanceof OrderStorageError)) console.error("[orders] Ошибка:", err);
    return json({ ok: false, error: "Не удалось отправить заявку. Попробуйте ещё раз через минуту." }, 500);
  }
}
