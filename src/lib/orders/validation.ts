/**
 * Валидация формы заявки. Общая для браузера и сервера — без внешних зависимостей.
 */
import type { Lang } from "@/i18n/lang";
import { toLatin } from "@/lib/translit";
import { CDEK_COUNTRIES, cdekCountry, DEFAULT_CDEK_COUNTRY, isCdekCountry, type CdekCountryCode } from "@/config/cdek-countries";
import { isKitTip, type ProductId } from "@/config/products";
import type { OrderRegion } from "./types";
import { emailSyntaxOk } from "./email-check";

export interface OrderInput {
  /** Язык сайта, с которого пришла заявка (для текстов ошибок) */
  lang: Lang;
  region: OrderRegion;
  /** Что покупают: мел или подарочный набор */
  product: ProductId;
  /** Наклейка JOS в подарочный набор (M, H, H+, PM, PH, PRO); у мела — пусто */
  tip: string;
  /**
   * Страна доставки СДЭК (для region = "ru"): Россия или страны ЕАЭС из src/config/cdek-countries.ts.
   * Для заявок в другие страны (region = "intl") не используется.
   */
  deliveryCountry: CdekCountryCode;
  /**
   * ИИН получателя (Казахстан, 12 цифр) или ПИН/ИНН (Кыргызстан, 14 цифр) — без него посылку в этих странах
   * не выдают и не пропускают. Для других стран пусто.
   */
  taxId: string;
  /** ФИО полностью. Для заказов вне России — латиницей (кириллица переводится автоматически). */
  name: string;
  phone: string;
  email: string;
  quantity: number;
  city: string;
  comment: string;
  /** Для заказов вне России */
  country: string;
  postalCode: string;
  address: string;
  consent: boolean;
  /** Согласие получать на почту письма о заказе: подтверждение оплаты и трек-номер (необязательно, рекламы нет) */
  newsletter: boolean;
  /** СДЭК: код города и код пункта выдачи (когда включён выбор ПВЗ) */
  cityCode: number;
  pickupPoint: string;
  /** Токен тестовой оплаты (из секретной ссылки ?paytest=) */
  payTest: string;
  /** Ловушка для ботов — у людей всегда пустая */
  trap: string;
}

export type OrderField = Exclude<keyof OrderInput, "lang" | "region" | "trap" | "cityCode" | "payTest" | "product">;
export type FieldErrors = Partial<Record<OrderField, string>>;

export const LIMITS = {
  name: 80,
  phone: 32,
  email: 120,
  city: 80,
  country: 80,
  postalCode: 16,
  address: 200,
  comment: 1000,
} as const;

const clean = (v: unknown, max: number) =>
  typeof v === "string"
    ? v
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
        .replace(/[ \t]+/g, " ")
        .trim()
        .slice(0, max)
    : "";

/** Приводит произвольный JSON к OrderInput (обрезает, чистит, приводит типы). */
export function normalizeOrderInput(raw: unknown): OrderInput {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const q = typeof r.quantity === "number" ? r.quantity : Number.parseInt(String(r.quantity ?? ""), 10);
  const cityCode = Number(r.cityCode);
  const lang: Lang = r.lang === "en" ? "en" : "ru";
  // Английская версия сайта — всегда заказ из-за рубежа
  const region: OrderRegion = lang === "en" || r.region === "intl" ? "intl" : "ru";
  const name = clean(r.name, LIMITS.name);
  const deliveryCountry: CdekCountryCode = region === "ru" && isCdekCountry(r.deliveryCountry) ? r.deliveryCountry : DEFAULT_CDEK_COUNTRY;
  const product: ProductId = r.product === "kit" ? "kit" : "chalk";
  return {
    lang,
    region,
    product,
    tip: product === "kit" && isKitTip(r.tip) ? r.tip : "",
    deliveryCountry,
    name: region === "intl" ? toLatin(name) : name,
    taxId: region === "ru" && TAX_ID_COUNTRIES.includes(deliveryCountry) ? digitsOnly(clean(r.taxId, 40)).slice(0, 20) : "",
    phone: clean(r.phone, LIMITS.phone),
    email: clean(r.email, LIMITS.email).toLowerCase(),
    quantity: Number.isFinite(q) ? Math.trunc(q) : 0,
    city: clean(r.city, LIMITS.city),
    comment: clean(r.comment, LIMITS.comment),
    country: clean(r.country, LIMITS.country),
    postalCode: clean(r.postalCode, LIMITS.postalCode),
    address: clean(r.address, LIMITS.address),
    consent: r.consent === true,
    newsletter: r.newsletter === true,
    cityCode: Number.isInteger(cityCode) && cityCode > 0 ? cityCode : 0,
    pickupPoint: clean(r.pickupPoint, 32).replace(/[^\p{L}\d_-]/gu, ""),
    payTest: clean(r.payTest, 64),
    trap: clean(r.trap, 100),
  };
}

export const digitsOnly = (s: string) => s.replace(/\D/g, "");

/** Страны, где для получения посылки нужен идентификационный номер получателя */
export const TAX_ID_COUNTRIES: readonly string[] = ["KZ", "KG"];

/** ИИН Казахстана: 12 цифр и контрольная сумма (последняя цифра) */
export function isValidKzIin(v: string): boolean {
  if (!/^\d{12}$/.test(v)) return false;
  const d = v.split("").map(Number);
  const sum = (w: number[]) => w.reduce((s, wi, i) => s + wi * d[i], 0) % 11;
  let c = sum([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  if (c === 10) c = sum([3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2]);
  return c !== 10 && c === d[11];
}

/** ПИН (ИНН физлица) Кыргызстана: 14 цифр, первая — 1 или 2 */
export const isValidKgPin = (v: string) => /^[12]\d{13}$/.test(v);

/** Российский номер → «+7 (999) 123-45-67». Иначе возвращает null. */
export function normalizeRuPhone(phone: string): string | null {
  let d = digitsOnly(phone);
  if (d.length === 10 && d.startsWith("9")) d = "7" + d;
  if (d.length === 11 && d.startsWith("8")) d = "7" + d.slice(1);
  if (d.length !== 11 || !d.startsWith("7")) return null;
  return renderPhone(cdekCountry("RU"), d.slice(1));
}

/** Международный номер → «+<цифры>». Иначе null. */
export function normalizeIntlPhone(phone: string): string | null {
  const d = digitsOnly(phone);
  if (d.length < 8 || d.length > 15) return null;
  return "+" + d;
}

/** Телефонные форматы стран доставки СДЭК: сначала длинные коды (375, 374, 996), потом +7 */
const PHONE_FORMATS = [...CDEK_COUNTRIES]
  .filter((c, i, all) => all.findIndex((x) => x.dial === c.dial) === i)
  .sort((a, b) => b.dial.length - a.dial.length);

/** «+375 (29) 123-45-67»: первая группа в скобках, вторая через пробел, остальные через дефис */
function renderPhone(c: { dial: string; groups: readonly number[] }, national: string): string {
  let out = "+" + c.dial;
  let pos = 0;
  c.groups.forEach((len, i) => {
    const part = national.slice(pos, pos + len);
    pos += len;
    if (!part && i > 0) return;
    if (i === 0) out += " (" + part + (part.length === len ? ")" : "");
    else out += (i === 1 ? " " : "-") + part;
  });
  return out;
}

/**
 * Номер для доставки СДЭК: российский или любой страны доставки (Беларусь, Казахстан, Армения, Кыргызстан) —
 * получатель может быть с номером другой страны из списка. Возвращает номер в виде «+375 (29) 123-45-67» или null.
 */
export function normalizeCdekPhone(phone: string): string | null {
  const ru = normalizeRuPhone(phone);
  if (ru) return ru;
  const d = digitsOnly(phone);
  const c = PHONE_FORMATS.find((f) => d.startsWith(f.dial) && d.length === f.dial.length + f.national);
  return c ? renderPhone(c, d.slice(c.dial.length)) : null;
}

export function normalizePhone(phone: string, region: OrderRegion): string | null {
  return region === "ru" ? normalizeCdekPhone(phone) : normalizeIntlPhone(phone);
}

/** Маска ввода телефона для России: +7 (999) 123-45-67 */
export function formatRuPhoneInput(value: string): string {
  return formatPhoneInput(value, "RU");
}

/**
 * Маска ввода телефона для страны доставки: цифры без «+» считаются номером этой страны
 * (внутренние префиксы 8 / 0 убираются), а номер, начатый с «+», — номером той страны, чей код набран.
 */
export function formatPhoneInput(value: string, country: CdekCountryCode): string {
  const explicit = value.trim().startsWith("+");
  const digits = digitsOnly(value);
  if (!digits) return explicit ? "+" : "";
  let c: { dial: string; national: number; groups: readonly number[] } | undefined = explicit
    ? PHONE_FORMATS.find((f) => digits.startsWith(f.dial))
    : undefined;
  let d = digits;
  if (!c) {
    const home = cdekCountry(country);
    // «+37», «+99» — код страны ещё набирают
    const partial = PHONE_FORMATS.some((f) => f.dial.length > digits.length && f.dial.startsWith(digits));
    if (partial && (explicit || home.dial !== "7")) return "+" + digits;
    c = home;
    if (c.dial === "7") {
      // 8… — внутренний префикс. В Казахстане номера сами начинаются с 7 (701, 747, 777…):
      // «7» в начале — код страны, только если набран номер целиком (11 цифр)
      if (d.startsWith("8")) d = "7" + d.slice(1);
      else if (!d.startsWith("7") || (country === "KZ" && d.length < 11)) d = "7" + d;
    }
    else if (!d.startsWith(c.dial)) d = c.dial + d;
  }
  let national = d.slice(c.dial.length);
  // Внутренние префиксы: 8 0… в Беларуси, 0… в Армении и Кыргызстане
  if (c.dial === "375") national = national.replace(/^[80]+/, "");
  else if (c.dial !== "7") national = national.replace(/^0+/, "");
  national = national.slice(0, c.national);
  return national ? renderPhone(c, national) : "+" + c.dial;
}

const NAME_RE = /^[\p{L}][\p{L}\s'’.-]*$/u;
const LATIN_NAME_RE = /^[A-Za-z][A-Za-z\s'’.-]*$/;
const POSTAL_RE = /^[\p{L}\d][\p{L}\d\s-]{1,14}$/u;

/** Слова ФИО: «Иванов Иван Иванович» → 3, «Анна-Мария Смит» → 2 */
export const nameWords = (name: string) => name.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length;

const MESSAGES = {
  ru: {
    nameEmpty: "Укажите ФИО",
    nameLetters: "ФИО может содержать только буквы",
    nameFull: "Укажите фамилию и имя полностью — как в паспорте",
    nameLatin: "ФИО латиницей: имя и фамилия, как в загранпаспорте",
    phoneEmpty: "Укажите телефон",
    phoneRu: "Номер в формате +7 (999) 123-45-67",
    phoneCountry: (example: string) => `Номер в формате ${example}`,
    phoneIntl: "Укажите номер с кодом страны",
    taxIdKz: "Укажите ИИН получателя — 12 цифр",
    taxIdKzBad: "Проверьте ИИН — в номере ошибка",
    taxIdKg: "Укажите ПИН (ИНН) получателя — 14 цифр, начинается с 1 или 2",
    emailEmpty: "Укажите email",
    emailBad: "Проверьте email",
    tip: "Выберите наклейку JOS для набора",
    qtyMin: "Минимум 1 шт.",
    qtyMax: (n: number) => `Доступно не более ${n} шт.`,
    soldOut: "Тираж распродан",
    city: "Укажите город",
    cityPick: "Выберите город из списка",
    pickupPoint: "Выберите пункт выдачи СДЭК",
    country: "Укажите страну",
    deliveryCountry: "В эту страну сейчас не доставляем — выберите «Другая страна»",
    postalEmpty: "Укажите индекс",
    postalBad: "Проверьте индекс",
    address: "Укажите адрес: улица, дом, квартира",
    consent: "Нужно согласие на обработку персональных данных",
    newsletter: "Нужно согласие на письма о заказе — так мы пришлём подтверждение оплаты и трек-номер",
  },
  en: {
    nameEmpty: "Enter your full name",
    nameLetters: "Use letters only",
    nameFull: "Enter your first and last name",
    nameLatin: "Full name in Latin letters, as in your passport",
    phoneEmpty: "Enter your phone number",
    phoneRu: "Format: +7 (999) 123-45-67",
    phoneCountry: (example: string) => `Format: ${example}`,
    phoneIntl: "Include the country code",
    taxIdKz: "Enter the recipient's IIN (12 digits)",
    taxIdKzBad: "Check the IIN",
    taxIdKg: "Enter the recipient's PIN (14 digits)",
    emailEmpty: "Enter your email",
    emailBad: "Check your email",
    tip: "Choose a JOS tip for the gift set",
    qtyMin: "Minimum 1 pc",
    qtyMax: (n: number) => `Up to ${n} pcs available`,
    soldOut: "Sold out",
    city: "Enter your city",
    cityPick: "Choose a city from the list",
    pickupPoint: "Choose a pickup point",
    country: "Enter your country",
    deliveryCountry: "We do not deliver to this country right now",
    postalEmpty: "Enter your postal code",
    postalBad: "Check your postal code",
    address: "Enter your address: street, building, apartment",
    consent: "Consent to personal data processing is required",
    newsletter: "Please agree to receive emails about your order — that is how we send the payment confirmation and tracking number",
  },
};

export function validateOrderInput(
  input: OrderInput,
  opts: {
    maxQuantity: number;
    requirePickupPoint?: boolean;
    /** Страны доставки СДЭК, включённые на сайте (по умолчанию — все) */
    countries?: readonly string[];
  },
): FieldErrors {
  const e: FieldErrors = {};
  const m = MESSAGES[input.lang] ?? MESSAGES.ru;

  if (input.name.length < 2) e.name = m.nameEmpty;
  else if (input.region === "intl" ? !LATIN_NAME_RE.test(input.name) : !NAME_RE.test(input.name))
    e.name = input.region === "intl" ? m.nameLatin : m.nameLetters;
  else if (nameWords(input.name) < 2) e.name = input.region === "intl" ? m.nameLatin : m.nameFull;

  if (!input.phone) e.phone = m.phoneEmpty;
  else if (!normalizePhone(input.phone, input.region))
    e.phone =
      input.region === "intl"
        ? m.phoneIntl
        : input.deliveryCountry === "RU"
          ? m.phoneRu
          : m.phoneCountry(cdekCountry(input.deliveryCountry).example);

  if (input.region === "ru" && input.deliveryCountry === "KZ") {
    if (input.taxId.length !== 12) e.taxId = m.taxIdKz;
    else if (!isValidKzIin(input.taxId)) e.taxId = m.taxIdKzBad;
  }
  if (input.region === "ru" && input.deliveryCountry === "KG" && !isValidKgPin(input.taxId)) e.taxId = m.taxIdKg;

  if (input.region === "ru" && opts.countries && !opts.countries.includes(input.deliveryCountry))
    e.deliveryCountry = m.deliveryCountry;

  if (!input.email) e.email = m.emailEmpty;
  else if (!emailSyntaxOk(input.email)) e.email = m.emailBad;

  if (input.product === "kit" && !input.tip) e.tip = m.tip;

  if (!Number.isInteger(input.quantity) || input.quantity < 1) e.quantity = m.qtyMin;
  else if (input.quantity > opts.maxQuantity) e.quantity = opts.maxQuantity > 0 ? m.qtyMax(opts.maxQuantity) : m.soldOut;

  if (input.city.length < 2) e.city = m.city;

  if (input.region === "ru" && opts.requirePickupPoint) {
    if (!input.cityCode) e.city = m.cityPick;
    else if (!input.pickupPoint) e.pickupPoint = m.pickupPoint;
  }

  if (input.region === "intl") {
    if (input.country.length < 2) e.country = m.country;
    if (!input.postalCode) e.postalCode = m.postalEmpty;
    else if (!POSTAL_RE.test(input.postalCode)) e.postalCode = m.postalBad;
    if (input.address.length < 5) e.address = m.address;
  }

  if (!input.consent) e.consent = m.consent;

  return e;
}
