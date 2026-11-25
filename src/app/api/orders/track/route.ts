/**
 * POST /api/orders/track { query } — статус заказа для блока «Где мой заказ».
 *   query — номер заказа (KA-260925-AB12) или телефон из заказа (от 10 цифр).
 *   По телефону — до 5 последних заказов на этот номер.
 * Старый формат { id, contact } тоже принимается (ссылки из писем).
 * Ответ без ФИО, контактов и адреса пункта выдачи. Не больше 12 запросов за 10 минут с одного адреса —
 * номера заказов и телефонов не перебрать.
 */
import { clientIp, createRateLimiter, json } from "@/lib/http";
import { ORDER_ID_RE } from "@/lib/orders/id";
import { parseTrackQuery, trackByPhone, trackOrder } from "@/lib/orders/track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rateLimit = createRateLimiter({ limit: 12, windowMs: 10 * 60 * 1000 });

export async function POST(request: Request) {
  const limit = rateLimit(clientIp(request));
  if (!limit.ok) return json({ ok: false, error: "rate" }, 429, { "Retry-After": String(limit.retryAfter) });
  const body = (await request.json().catch(() => null)) as { query?: unknown; id?: unknown; contact?: unknown } | null;
  const contact = String(body?.contact ?? "").trim().slice(0, 120);
  const q = parseTrackQuery(String(body?.query ?? body?.id ?? "").slice(0, 60));
  if (!q || (q.kind === "id" && !ORDER_ID_RE.test(q.id))) return json({ ok: false, error: "input" }, 400);
  try {
    const orders =
      q.kind === "id"
        ? await trackOrder(q.id, contact.length >= 5 ? contact : "").then((o) => (o ? [o] : []))
        : await trackByPhone(q.key);
    if (!orders.length) return json({ ok: false, error: "notfound" }, 404);
    return json({ ok: true, orders, order: orders[0] });
  } catch (err) {
    console.error("[track]", err);
    return json({ ok: false, error: "unavailable" }, 502);
  }
}
