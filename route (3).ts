/** POST /api/delivery/cdek/calculate { cityCode, quantity } — стоимость и срок доставки до ПВЗ. */
import { features } from "@/config/features";
import { PRODUCT } from "@/config/site";
import { calculateDelivery } from "@/lib/delivery/cdek";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!features.cdek) return json({ ok: false, error: "Доставка СДЭК пока не подключена" }, 503);
  let body: { cityCode?: unknown; quantity?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "Некорректный запрос" }, 400);
  }
  const cityCode = Number(body.cityCode);
  const quantity = Math.min(PRODUCT.maxPerOrder, Math.max(1, Math.trunc(Number(body.quantity) || 1)));
  if (!Number.isInteger(cityCode) || cityCode <= 0) return json({ ok: false, error: "Не указан cityCode" }, 400);
  try {
    return json({ ok: true, quote: await calculateDelivery({ toCityCode: cityCode, quantity }) });
  } catch (err) {
    console.error("[cdek] calculate:", err);
    return json({ ok: false, error: "Не удалось рассчитать доставку" }, 502);
  }
}
