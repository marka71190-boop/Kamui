/**
 * GET /api/delivery/cdek/cities?q=Красн — подсказки городов СДЭК для формы заказа.
 * &country=BY — города другой страны доставки (только из включённых на сайте: RU, BY, KZ, AM, KG).
 */
import type { CdekCountryCode } from "@/config/cdek-countries";
import { features } from "@/config/features";
import { suggestCities } from "@/lib/delivery/cdek";
import { clientIp, createRateLimiter, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rateLimit = createRateLimiter({ limit: 120, windowMs: 10 * 60 * 1000 });

export async function GET(request: Request) {
  if (!features.cdek) return json({ ok: false, error: "Доставка СДЭК пока не подключена" }, 503);
  if (!rateLimit(clientIp(request)).ok) return json({ ok: false, error: "Слишком много запросов" }, 429);
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return json({ ok: false, error: "Введите минимум 2 символа" }, 400);
  const country = (params.get("country") ?? "RU").toUpperCase();
  if (!features.cdekCountries.includes(country as CdekCountryCode))
    return json({ ok: false, error: "В эту страну доставка СДЭК не подключена" }, 400);
  try {
    return json({ ok: true, cities: await suggestCities(q, country) }, 200, {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    });
  } catch (err) {
    console.error("[cdek] cities:", err);
    return json({ ok: false, error: "СДЭК временно недоступен", detail: String((err as Error).message).slice(0, 300) }, 502);
  }
}
