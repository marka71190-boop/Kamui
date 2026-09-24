/**
 * Валидация формы заявки. Общая для браузера и сервера — без внешних зависимостей.
 */
import type { OrderRegion } from "./types";

export interface OrderInput {
  region: OrderRegion;
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
  /** Ловушка для ботов — у людей всегда пустая */
  company: string;
}

export type OrderField = Exclude<keyof OrderInput, "region" | "company">;
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
  return {
    region: r.region === "intl" ? "intl" : "ru",
    name: clean(r.name, LIMITS.name),
    phone: clean(r.phone, LIMITS.phone),
    email: clean(r.email, LIMITS.email).toLowerCase(),
    quantity: Number.isFinite(q) ? Math.trunc(q) : 0,
    city: clean(r.city, LIMITS.city),
    comment: clean(r.comment, LIMITS.comment),
    country: clean(r.country, LIMITS.country),
    postalCode: clean(r.postalCode, LIMITS.postalCode),
    address: clean(r.address, LIMITS.address),
    consent: r.consent === true,
    company: clean(r.company, 100),
  };
}

export const digitsOnly = (s: string) => s.replace(/\D/g, "");

/** Российский номер → «+7 (999) 123-45-67». Иначе возвращает null. */
export function normalizeRuPhone(phone: string): string | null {
  let d = digitsOnly(phone);
  if (d.length === 10 && d.startsWith("9")) d = "7" + d;
  if (d.length === 11 && d.startsWith("8")) d = "7" + d.slice(1);
  if (d.length !== 11 || !d.startsWith("7")) return null;
  return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
}

/** Международный номер → «+<цифры>». Иначе null. */
export function normalizeIntlPhone(phone: string): string | null {
  const d = digitsOnly(phone);
  if (d.length < 8 || d.length > 15) return null;
  return "+" + d;
}

export function normalizePhone(phone: string, region: OrderRegion): string | null {
  return region === "ru" ? normalizeRuPhone(phone) : normalizeIntlPhone(phone);
}

/** Маска ввода телефона для России: +7 (999) 123-45-67 */
export function formatRuPhoneInput(value: string): string {
  let d = digitsOnly(value);
  if (!d) return "";
  if (d.startsWith("8")) d = "7" + d.slice(1);
  if (!d.startsWith("7")) d = "7" + d;
  d = d.slice(0, 11);
  let out = "+7";
  if (d.length > 1) out += " (" + d.slice(1, 4);
  if (d.length >= 4) out += ")";
  if (d.length > 4) out += " " + d.slice(4, 7);
  if (d.length > 7) out += "-" + d.slice(7, 9);
  if (d.length > 9) out += "-" + d.slice(9, 11);
  return out;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_RE = /^[\p{L}][\p{L}\s'’.-]*$/u;
const POSTAL_RE = /^[\p{L}\d][\p{L}\d\s-]{1,14}$/u;

export function validateOrderInput(input: OrderInput, opts: { maxQuantity: number }): FieldErrors {
  const e: FieldErrors = {};

  if (input.name.length < 2) e.name = "Укажите имя";
  else if (!NAME_RE.test(input.name)) e.name = "Имя может содержать только буквы";

  if (!input.phone) e.phone = "Укажите телефон";
  else if (!normalizePhone(input.phone, input.region))
    e.phone = input.region === "ru" ? "Номер в формате +7 (999) 123-45-67" : "Укажите номер с кодом страны";

  if (!input.email) e.email = "Укажите email";
  else if (!EMAIL_RE.test(input.email)) e.email = "Проверьте email";

  if (!Number.isInteger(input.quantity) || input.quantity < 1) e.quantity = "Минимум 1 шт.";
  else if (input.quantity > opts.maxQuantity)
    e.quantity = opts.maxQuantity > 0 ? `Доступно не более ${opts.maxQuantity} шт.` : "Тираж распродан";

  if (input.city.length < 2) e.city = "Укажите город";

  if (input.region === "intl") {
    if (input.country.length < 2) e.country = "Укажите страну";
    if (!input.postalCode) e.postalCode = "Укажите индекс";
    else if (!POSTAL_RE.test(input.postalCode)) e.postalCode = "Проверьте индекс";
    if (input.address.length < 5) e.address = "Укажите адрес: улица, дом, квартира";
  }

  if (!input.consent) e.consent = "Нужно согласие на обработку персональных данных";

  return e;
}
