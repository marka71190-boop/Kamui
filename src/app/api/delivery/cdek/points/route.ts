/** GET /api/delivery/cdek/points?cityCode=44 — пункты выдачи СДЭК в городе. */
import { features } from "@/config/features";
import { getPickupPoints } from "@/lib/delivery/cdek";
import { clientIp, createRateLimiter, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rateLimit = createRateLimiter({ limit: 60, windowMs: 10 * 60 * 1000 });

export async function GET(request: Request) {
  if (!features.cdek) return json({ ok: false, error: "Доставка СДЭК пока не подключена" }, 503);
  if (!rateLimit(clientIp(request)).ok) return json({ ok: false, error: "Слишком много запросов" }, 429);
  const cityCode = Number(new URL(request.url).searchParams.get("cityCode"));
  if (!Number.isInteger(cityCode) || cityCode <= 0) return json({ ok: false, error: "Не указан cityCode" }, 400);
  try {
    const points = (await getPickupPoints(cityCode)).map(({ code, name, address, workTime }) => ({
      code,
      name,
      address,
      workTime,
    }));
    return json({ ok: true, points }, 200, { "Cache-Control": "public, max-age=600, s-maxage=3600" });
  } catch (err) {
    console.error("[cdek] points:", err);
    return json({ ok: false, error: "СДЭК временно недоступен", detail: String((err as Error).message).slice(0, 300) }, 502);
  }
}
