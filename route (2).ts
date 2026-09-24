/** GET /api/delivery/cdek/points?cityCode=44 — пункты выдачи СДЭК в городе. */
import { features } from "@/config/features";
import { getPickupPoints } from "@/lib/delivery/cdek";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!features.cdek) return json({ ok: false, error: "Доставка СДЭК пока не подключена" }, 503);
  const cityCode = Number(new URL(request.url).searchParams.get("cityCode"));
  if (!Number.isInteger(cityCode) || cityCode <= 0) return json({ ok: false, error: "Не указан cityCode" }, 400);
  try {
    return json({ ok: true, points: await getPickupPoints(cityCode) });
  } catch (err) {
    console.error("[cdek] points:", err);
    return json({ ok: false, error: "СДЭК временно недоступен" }, 502);
  }
}
