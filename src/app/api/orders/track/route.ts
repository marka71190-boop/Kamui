/**
 * POST /api/orders/track { id, contact } — статус заказа для страницы «Где мой заказ».
 * contact — почта или телефон из заказа: без него статус не отдаётся.
 */
import { clientIp, createRateLimiter, json } from "@/lib/http";
import { ORDER_ID_RE } from "@/lib/orders/id";
import { trackOrder } from "@/lib/orders/track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rateLimit = createRateLimiter({ limit: 12, windowMs: 10 * 60 * 1000 });

export async function POST(request: Request) {
  const limit = rateLimit(clientIp(request));
  if (!limit.ok) return json({ ok: false, error: "rate" }, 429, { "Retry-After": String(limit.retryAfter) });
  const body = (await request.json().catch(() => null)) as { id?: unknown; contact?: unknown } | null;
  const id = String(body?.id ?? "").trim().toUpperCase();
  const contact = String(body?.contact ?? "").trim().slice(0, 120);
  if (!ORDER_ID_RE.test(id) || contact.length < 5) return json({ ok: false, error: "input" }, 400);
  try {
    const order = await trackOrder(id, contact);
    // Нет заказа или не тот контакт — один и тот же ответ: номера заказов нельзя перебирать
    if (!order) return json({ ok: false, error: "notfound" }, 404);
    return json({ ok: true, order });
  } catch (err) {
    console.error("[track]", err);
    return json({ ok: false, error: "unavailable" }, 502);
  }
}
