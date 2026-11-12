/**
 * Цены для покупателей из-за рубежа — в долларах.
 *   PRICE_USD=48          — цена за 1 шт. (по умолчанию PRODUCT.priceUsd);
 *   KIT_PRICE_USD=83      — цена подарочного набора (по умолчанию KIT.priceUsd);
 *   WHOLESALE_PRICE_USD=41 — оптовая цена мела от 10 шт. (по умолчанию WHOLESALE.priceUsd);
 *   курс ЦБ РФ            — для пересчёта в рубли при оплате (обновляется раз в час);
 *   если ЦБ недоступен    — курс USD_RATE_FALLBACK (по умолчанию 90).
 */
import { KIT, priceFor, WHOLESALE, type ProductId } from "@/config/products";
import { PRODUCT } from "@/config/site";

export interface UsdRate {
  /** ₽ за $1 */
  rate: number;
  source: "cbr" | "fallback";
}

export async function getUsdRate(): Promise<UsdRate> {
  try {
    const res = await fetch("https://www.cbr-xml-daily.ru/daily_json.js", {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5_000),
    });
    const data = JSON.parse(await res.text()) as { Valute?: { USD?: { Value?: number } } };
    const rate = Number(data.Valute?.USD?.Value);
    if (rate > 10 && rate < 1000) return { rate, source: "cbr" };
  } catch (err) {
    console.warn("[currency] Курс ЦБ недоступен:", (err as Error).message);
  }
  const fb = Number(process.env.USD_RATE_FALLBACK || 90);
  return { rate: fb > 10 ? fb : 90, source: "fallback" };
}

/** Цена 1 шт. в долларах: PRICE_USD или PRODUCT.priceUsd */
export function unitPriceUsd(): number {
  const fixed = Number(process.env.PRICE_USD);
  return Number.isFinite(fixed) && fixed > 0 ? Math.round(fixed) : PRODUCT.priceUsd;
}

/** Цена подарочного набора в долларах: KIT_PRICE_USD или KIT.priceUsd */
export function kitPriceUsd(): number {
  const fixed = Number(process.env.KIT_PRICE_USD);
  return Number.isFinite(fixed) && fixed > 0 ? Math.round(fixed) : KIT.priceUsd;
}

/** Оптовая цена мела (от 10 шт.) в долларах: WHOLESALE_PRICE_USD или WHOLESALE.priceUsd */
export function wholesalePriceUsd(): number {
  const fixed = Number(process.env.WHOLESALE_PRICE_USD);
  return Number.isFinite(fixed) && fixed > 0 ? Math.round(fixed) : WHOLESALE.priceUsd;
}

export interface UsdPrice {
  /** Цена 1 шт., $ */
  unit: number;
  /** Цена подарочного набора, $ */
  kit: number;
  /** Оптовая цена мела от 10 шт., $ */
  wholesale: number;
  /** Курс ₽ за $ */
  rate: number;
  source: UsdRate["source"];
}

export async function getUsdPrice(): Promise<UsdPrice> {
  const { rate, source } = await getUsdRate();
  return { unit: unitPriceUsd(), kit: kitPriceUsd(), wholesale: wholesalePriceUsd(), rate, source };
}

/**
 * Надбавка к стоимости доставки для заказов из-за рубежа, % — покрывает комиссию Robokassa
 * за карты зарубежных банков (9,9% со всей суммы; 11% возвращают её полностью). ABROAD_MARKUP_PERCENT.
 */
export function abroadMarkupPercent(): number {
  const v = Number(process.env.ABROAD_MARKUP_PERCENT ?? 11);
  return Number.isFinite(v) && v >= 0 && v < 100 ? v : 11;
}

/** Цены для заказов из-за рубежа: мел — в долларах, доставка — из рублей СДЭК с надбавкой; оплата — в рублях по курсу */
export interface AbroadPricing {
  unitUsd: number;
  /** Подарочный набор, $ */
  kitUsd: number;
  /** Мел по оптовой цене (от 10 шт.), $ */
  wholesaleUsd: number;
  rate: number;
  markupPercent: number;
}

/** Цена 1 шт. в долларах для заказа из-за рубежа: набор, мел или мел по оптовой цене (от 10 шт.) */
export const abroadUnitUsd = (
  a: Pick<AbroadPricing, "unitUsd" | "kitUsd" | "wholesaleUsd">,
  product: ProductId,
  quantity: number,
): number => priceFor(product, quantity, { unit: a.unitUsd, kit: a.kitUsd, wholesale: a.wholesaleUsd });

export async function getAbroadPricing(): Promise<AbroadPricing> {
  const { unit, kit, wholesale, rate } = await getUsdPrice();
  return { unitUsd: unit, kitUsd: kit, wholesaleUsd: wholesale, rate, markupPercent: abroadMarkupPercent() };
}

/** Доставка для покупателя из-за рубежа, целые $: цена СДЭК для покупателя (₽) + надбавка, по курсу, вверх */
export const deliveryUsdFor = (deliveryRub: number, p: Pick<AbroadPricing, "rate" | "markupPercent">) =>
  deliveryRub > 0 ? Math.ceil((deliveryRub * (1 + p.markupPercent / 100)) / p.rate) : 0;

/** Доллары → рубли к оплате (по курсу, до рубля) */
export const usdToRub = (usd: number, rate: number) => Math.round(usd * rate);
