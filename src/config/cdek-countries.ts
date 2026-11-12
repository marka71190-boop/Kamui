/**
 * Страны, куда мел доставляется СДЭК до пункта выдачи с онлайн-оплатой — так же, как по России.
 *
 * Все они в ЕАЭС: таможни нет, работает тот же тариф «Посылка склад-склад» (136).
 * Проверено по API СДЭК 26.09.2026 для посылки 23 г из Краснодара:
 *   Беларусь   — 89 ПВЗ,  415 ₽, 5–6 дн. (Минск)
 *   Казахстан  — 185 ПВЗ, 545 ₽, 11–12 дн. (Алматы)
 *   Армения    — 20 ПВЗ,  800 ₽, 6–7 дн. (Ереван)
 *   Кыргызстан — 38 ПВЗ,  590 ₽, 7–8 дн. (Бишкек)
 * (цены — тариф СДЭК, покупателю добавляется наценка DELIVERY_MARKUP_PERCENT).
 *
 * В другие страны СДЭК из этого договора возит только с таможенным оформлением (или не возит),
 * поэтому для них остаётся заявка менеджеру («Другая страна»).
 *
 * По умолчанию СДЭК с оплатой на сайте — только по России (для покупателей из других стран нужен эквайринг,
 * принимающий иностранные карты). Включить страны без правки кода — переменная окружения на сервере:
 *   CDEK_COUNTRIES=RU,BY,KZ,AM,KG   (или только часть, например RU,BY,KZ)
 */

export interface CdekCountry {
  /** Код страны ISO 3166-1 — как в API СДЭК */
  code: string;
  /** Название для формы и таблицы */
  name: string;
  /** «в Беларусь», «по России» — для текстов */
  to: string;
  /** Телефонный код без «+» */
  dial: string;
  /** Сколько цифр в номере после кода страны */
  national: number;
  /** Как группировать цифры номера: первая группа — в скобках */
  groups: readonly number[];
  /** Пример номера для подсказки в поле */
  example: string;
  /** Пример города для подсказки в поле */
  cityExample: string;
}

export const CDEK_COUNTRIES = [
  { code: "RU", name: "Россия", to: "по России", dial: "7", national: 10, groups: [3, 3, 2, 2], example: "+7 (999) 123-45-67", cityExample: "Краснодар" },
  { code: "BY", name: "Беларусь", to: "в Беларусь", dial: "375", national: 9, groups: [2, 3, 2, 2], example: "+375 (29) 123-45-67", cityExample: "Минск" },
  { code: "KZ", name: "Казахстан", to: "в Казахстан", dial: "7", national: 10, groups: [3, 3, 2, 2], example: "+7 (701) 123-45-67", cityExample: "Алматы" },
  { code: "AM", name: "Армения", to: "в Армению", dial: "374", national: 8, groups: [2, 2, 2, 2], example: "+374 (91) 12-34-56", cityExample: "Ереван" },
  { code: "KG", name: "Кыргызстан", to: "в Кыргызстан", dial: "996", national: 9, groups: [3, 3, 3], example: "+996 (555) 123-456", cityExample: "Бишкек" },
] as const satisfies readonly CdekCountry[];

export type CdekCountryCode = (typeof CDEK_COUNTRIES)[number]["code"];

export const DEFAULT_CDEK_COUNTRY: CdekCountryCode = "RU";

export const isCdekCountry = (v: unknown): v is CdekCountryCode => CDEK_COUNTRIES.some((c) => c.code === v);

export const cdekCountry = (code: string): CdekCountry => CDEK_COUNTRIES.find((c) => c.code === code) ?? CDEK_COUNTRIES[0];

/** Страны из переменной CDEK_COUNTRIES (по умолчанию — только Россия). Россия всегда первая. */
export function enabledCdekCountries(env: string | undefined): CdekCountryCode[] {
  const wanted = (env ?? "")
    .split(/[\s,;]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(isCdekCountry);
  const codes = CDEK_COUNTRIES.filter((c) => c.code !== "RU" && wanted.includes(c.code)).map((c) => c.code) as CdekCountryCode[];
  return ["RU", ...codes];
}

/** «в Беларусь, Казахстан и Армению» — страны доставки кроме России (пусто, если их нет) */
export function abroadAreaText(codes: readonly string[]): string {
  const abroad = codes.filter((c) => c !== "RU");
  return abroad.length ? deliveryAreaText(["RU", ...abroad]).replace(/^по России,? (и )?/, "") : "";
}

/** «по России, в Беларусь, Казахстан, Армению и Кыргызстан» */
export function deliveryAreaText(codes: readonly string[]): string {
  const [first, ...rest] = codes.map((c) => cdekCountry(c).to);
  if (!rest.length) return first ?? "";
  const tail = rest.map((t, i) => (i === 0 ? t : t.replace(/^в /, "")));
  return tail.length === 1 ? `${first} и ${tail[0]}` : `${first}, ${tail.slice(0, -1).join(", ")} и ${tail.at(-1)}`;
}
