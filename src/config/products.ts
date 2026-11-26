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
  /** Опт на сайте закрыт: оптовой цены нет, в заказе до PRODUCT.maxPerOrder шт., опт — по телефону и в Telegram */
  enabled: false as boolean,
  minQty: 10,
  price: 3000,
  priceUsd: 41,
} as const;

/** Действует ли оптовая цена: мел, от WHOLESALE.minQty шт. */
export const isWholesale = (p: ProductId, quantity: number): boolean =>
  WHOLESALE.enabled && p !== "kit" && quantity >= WHOLESALE.minQty;

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

/**
 * Наклейки JOS, которые можно докупить к мелу или набору: любая жёсткость из KIT_TIPS, всего не больше maxPerOrder шт.
 * Цена одна для всех видов. Остаток тиража мела не уменьшают.
 * Цена для заказов из-за рубежа — priceUsd (с комиссией Robokassa, как у мела).
 */
export const EXTRA_TIP = {
  /** Вид с подписью «Выбор Иосифа Абрамова» */
  choice: "PM" as KitTip,
  choiceNote: "Выбор Иосифа Абрамова",
  choiceNoteEn: "Iosif Abramov's choice",
  /** Цена 1 шт., ₽ */
  price: 1300,
  /** Цена 1 шт. для заказов из-за рубежа, $ */
  priceUsd: 18,
  /** Всего наклеек в одном заказе (все виды вместе) */
  maxPerOrder: 10,
  /** Вес одной наклейки в zip-пакете, г — для расчёта доставки */
  weight: 5,
} as const;

/** Докупленные наклейки по видам: { PM: 2, H: 1 } */
export type TipsMap = Partial<Record<KitTip, number>>;

/** Название для чека и накладной: «Наклейка JOS PM — выбор Иосифа Абрамова», «Наклейка JOS H» */
export const extraTipName = (t: KitTip): string =>
  t === EXTRA_TIP.choice ? `Наклейка JOS ${t} — ${EXTRA_TIP.choiceNote.toLowerCase()}` : `Наклейка JOS ${t}`;
export const extraTipNameIntl = (t: KitTip): string => `JOS cue tip ${t}`;
export const extraTipSku = (t: KitTip): string => `JOS-${t.replace("+", "PLUS")}`;

/**
 * Приводит к TipsMap: только известные виды, целые числа больше нуля, всего не больше maxPerOrder.
 * Число (старый формат — только PM) → { PM: n }.
 */
export function normalizeTips(v: unknown): TipsMap {
  const raw: Record<string, unknown> =
    typeof v === "number" || typeof v === "string" ? { [EXTRA_TIP.choice]: v } : v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const out: TipsMap = {};
  let left: number = EXTRA_TIP.maxPerOrder;
  for (const t of KIT_TIPS) {
    const n = Math.trunc(Number(raw[t]));
    if (!Number.isFinite(n) || n <= 0 || left <= 0) continue;
    out[t] = Math.min(n, left);
    left -= out[t]!;
  }
  return out;
}

/** Всего наклеек */
export const tipsCount = (t?: TipsMap | null): number => KIT_TIPS.reduce((s, k) => s + (t?.[k] ?? 0), 0);

/** «PM × 2, H × 1» */
export const tipsText = (t?: TipsMap | null): string =>
  KIT_TIPS.filter((k) => (t?.[k] ?? 0) > 0)
    .map((k) => `${k} × ${t![k]}`)
    .join(", ");

/** Коротко для метаданных платежа: «PM:2,H:1» */
export const packTips = (t: TipsMap): string =>
  KIT_TIPS.filter((k) => (t[k] ?? 0) > 0)
    .map((k) => `${k}:${t[k]}`)
    .join(",");

export const unpackTips = (s?: string | null): TipsMap =>
  normalizeTips(Object.fromEntries(String(s ?? "").split(",").map((p) => p.split(":") as [string, string]).filter((p) => p.length === 2)));

/** Строка для таблицы заказов (комментарий): докупленные наклейки */
export const tipsOrderNote = (t: TipsMap, price: string): string => `+ Наклейки JOS (докупка): ${tipsText(t)} · ${price} за шт.`;

/** Докупленные наклейки из строки комментария (для заказов из таблицы); понимает и первый формат «JOS PM (выбор Иосифа) × N» */
export function tipsFromNote(comment: string): TipsMap {
  const c = String(comment ?? "");
  const list = /Наклейки JOS \(докупка\): ([^·\n]+)/.exec(c)?.[1];
  if (list) {
    const map: Record<string, string> = {};
    for (const m of list.matchAll(/([A-Z]+\+?) × (\d+)/g)) map[m[1]] = m[2];
    return normalizeTips(map);
  }
  const old = /JOS PM \(выбор Иосифа\) × (\d+)/.exec(c)?.[1];
  return old ? normalizeTips({ PM: old }) : {};
}

/**
 * Сервисный сбор — с каждого заказа, отдельной строкой в расчёте и в чеке.
 * Для заказов из-за рубежа — priceUsd (оплата в рублях по курсу ЦБ).
 */
export const SERVICE_FEE = {
  name: "Сервисный сбор",
  price: 29,
  priceUsd: 0.5,
} as const;
