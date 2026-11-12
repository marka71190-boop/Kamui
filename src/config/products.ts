/**
 * Что можно купить на сайте: мел или подарочный набор.
 * В каждом наборе — один мел из тиража, поэтому набор уменьшает остаток так же, как мел.
 * Цена набора меняется здесь (KIT.price); цена для заказов из-за рубежа — KIT.priceUsd или переменная KIT_PRICE_USD.
 * Оптовая цена мела (от 10 шт. в одном заказе) — WHOLESALE; из-за рубежа — WHOLESALE.priceUsd или WHOLESALE_PRICE_USD.
 */
import { PRODUCT } from "./site";

export type ProductId = "chalk" | "kit";

export const isProductId = (v: unknown): v is ProductId => v === "chalk" || v === "kit";

/** Наклейки JOS, которые можно выбрать в набор */
export const KIT_TIPS = ["M", "H", "H+", "PM", "PH", "PRO"] as const;
export type KitTip = (typeof KIT_TIPS)[number];
export const isKitTip = (v: unknown): v is KitTip => typeof v === "string" && (KIT_TIPS as readonly string[]).includes(v);

export const KIT = {
  /** Полное название — в чеке и накладной */
  name: "Подарочный набор Kamui × Iosif Abramov 0.98 β",
  /** Коротко — в описании платежа */
  shortName: "Подарочный набор Kamui × Iosif Abramov",
  /** Латиницей — для накладной СДЭК за пределы России */
  nameIntl: "Gift set Kamui x Iosif Abramov: billiard chalk 0.98 beta, signed photo, cloth, JOS cue tip",
  sku: "KAMUI-ABRAMOV-KIT",
  /** Цена набора, ₽ */
  price: 6000,
  /** Цена набора для заказов из-за рубежа, $ (с комиссией Robokassa, как у мела). Переопределить — KIT_PRICE_USD. */
  priceUsd: 83,
} as const;

/**
 * Оптовая цена мела: от minQty шт. в одном заказе — price ₽ за каждую штуку
 * (для заказов из-за рубежа — priceUsd $, переопределить — WHOLESALE_PRICE_USD).
 * На подарочные наборы не распространяется.
 */
export const WHOLESALE = {
  minQty: 10,
  price: 3000,
  priceUsd: 41,
} as const;

/** Действует ли оптовая цена: мел, от WHOLESALE.minQty шт. */
export const isWholesale = (p: ProductId, quantity: number): boolean => p !== "kit" && quantity >= WHOLESALE.minQty;

/** Цены одной версии сайта (₽ или $): мел, подарочный набор, мел по оптовой цене */
export interface PriceList {
  unit: number;
  kit: number;
  wholesale: number;
}

export const RUB_PRICES: PriceList = { unit: PRODUCT.price, kit: KIT.price, wholesale: WHOLESALE.price };

/** Цена 1 шт. товара при заказе quantity шт.: у мела от 10 шт. — оптовая */
export const priceFor = (p: ProductId, quantity: number, prices: PriceList): number =>
  p === "kit" ? prices.kit : isWholesale(p, quantity) ? prices.wholesale : prices.unit;

/** Цена 1 шт. товара в рублях (при заказе quantity шт.) */
export const productPrice = (p: ProductId, quantity = 1): number => priceFor(p, quantity, RUB_PRICES);

/** Название для чека и накладной: у набора — с выбранной наклейкой */
export const productName = (p: ProductId, tip?: string): string =>
  p === "kit" ? `${KIT.name} (наклейка JOS ${tip || "—"})` : PRODUCT.name;

/** Строка для таблицы заказов (первая строка комментария) */
export const kitOrderNote = (quantity: number, tip: string): string =>
  `Подарочный набор × ${quantity} · наклейка JOS ${tip}`;

/** Строка для таблицы заказов: мел по оптовой цене */
export const wholesaleOrderNote = (unit: string): string => `Оптовая цена (от ${WHOLESALE.minQty} шт.): ${unit} за шт.`;
