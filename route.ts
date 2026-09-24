/** GET /api/delivery/cdek/cities?q=Краснодар — поиск города СДЭК (для выбора ПВЗ). */
import { features } from "@/config/features";
import { findCities } from "@/lib/delivery/cdek";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!features.cdek) return json({ ok: false, error: "Доставка СДЭК пока не подключена" }, 503);
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return json({ ok: false, error: "Введите минимум 2 символа" }, 400);
  try {
    return json({ ok: true, cities: await findCities(q) });
  } catch (err) {
    console.error("[cdek] cities:", err);
    return json({ ok: false, error: "СДЭК временно недоступен" }, 502);
  }
}
