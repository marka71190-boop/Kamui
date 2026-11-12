/**
 * POST /api/delivery/cdek/calculate { cityCode, quantity, country?, product? } — стоимость и срок доставки до ПВЗ.
 * product: "chalk" (по умолчанию) или "kit" — подарочный набор (другие размеры посылки и объявленная стоимость).
 * GET  /api/delivery/cdek/calculate?cityCode=44&quantity=1 — то же самое, для проверки в браузере.
 * country (BY, KZ, AM, KG) при оплате через Robokassa — дополнительно цена в долларах (usd) для покупателя из-за рубежа.
 */
import { features } from "@/config/features";
import { productPrice, type ProductId } from "@/config/products";
import { PRODUCT } from "@/config/site";
import { abroadUnitUsd, deliveryUsdFor, getAbroadPricing, usdToRub } from "@/lib/currency";
import { calculateDelivery } from "@/lib/delivery/cdek";
import { customerDeliveryPrice } from "@/lib/delivery/price";
import { clientIp, createRateLimiter, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rateLimit = createRateLimiter({ limit: 60, windowMs: 10 * 60 * 1000 });

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  return quote(request, { cityCode: q.get("cityCode"), quantity: q.get("quantity"), country: q.get("country"), product: q.get("product") });
}

export async function POST(request: Request) {
  let body: { cityCode?: unknown; quantity?: unknown; country?: unknown; product?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "Некорректный запрос" }, 400);
  }
  return quote(request, body);
}

async function quote(request: Request, body: { cityCode?: unknown; quantity?: unknown; country?: unknown; product?: unknown }) {
  if (!features.cdek) return json({ ok: false, error: "Доставка СДЭК пока не подключена" }, 503);
  if (!rateLimit(clientIp(request)).ok) return json({ ok: false, error: "Слишком много запросов" }, 429);
  const cityCode = Number(body.cityCode);
  const quantity = Math.min(PRODUCT.maxPerOrder, Math.max(1, Math.trunc(Number(body.quantity) || 1)));
  if (!Number.isInteger(cityCode) || cityCode <= 0) return json({ ok: false, error: "Не указан cityCode" }, 400);
  try {
    // Заказ из-за рубежа с оплатой через Robokassa — цена в долларах с надбавкой на комиссию
    const country = String(body.country ?? "RU").toUpperCase();
    const abroad =
      country !== "RU" && features.robokassa && features.cdekCountries.includes(country as never)
        ? await getAbroadPricing()
        : null;
    // Объявленная стоимость = стоимость товаров в заказе: СДЭК добавляет к доставке страховку от неё
    const product: ProductId = body.product === "kit" ? "kit" : "chalk";
    // (мел от 10 шт. — по оптовой цене)
    const unitRub = abroad ? usdToRub(abroadUnitUsd(abroad, product, quantity), abroad.rate) : productPrice(product, quantity);
    const quote = await calculateDelivery({ toCityCode: cityCode, quantity, product, declaredValue: unitRub * quantity });
    // Покупателю показываем цену с наценкой; тариф СДЭК наружу не отдаём.
    const { periodMin, periodMax } = quote;
    const cost = customerDeliveryPrice(quote.cost);
    const usd = abroad ? deliveryUsdFor(cost, abroad) : undefined;
    return json({ ok: true, quote: { cost, periodMin, periodMax, ...(usd !== undefined ? { usd } : {}) } });
  } catch (err) {
    console.error("[cdek] calculate:", err);
    return json({ ok: false, error: "Не удалось рассчитать доставку", detail: String((err as Error).message).slice(0, 300) }, 502);
  }
}
