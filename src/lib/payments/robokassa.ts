/**
 * Robokassa — оплата заказов с доставкой СДЭК за пределы России (Беларусь, Казахстан, Армения, Кыргызстан):
 * принимает карты Visa, Mastercard и UnionPay зарубежных банков (и российские карты).
 * Документация: https://docs.robokassa.ru/
 *
 * Как устроено:
 *   1. Сайт сохраняет заказ в таблицу и формирует подписанную ссылку на оплату (запросов к Robokassa не нужно).
 *   2. После оплаты Robokassa вызывает Result URL (/api/payments/robokassa/result) — сайт проверяет подпись
 *      паролем №2, ставит в таблице «Оплачена» и создаёт накладную СДЭК.
 *   3. Покупатель возвращается через Success URL / Fail URL на страницу заказа, где сайт проверяет статус (OpStateExt).
 *
 * Данные для накладной едут в параметре Shp_data (base64url) — базы данных у сайта нет.
 *
 * Включение (панель хостинга):
 *   ROBOKASSA_LOGIN=<идентификатор магазина>  ROBOKASSA_PASSWORD1=…  ROBOKASSA_PASSWORD2=…
 *   ROBOKASSA_HASH=md5 (как в технических настройках магазина: md5, sha1, sha256, sha384, sha512, ripemd160)
 *   ROBOKASSA_TEST=true — тестовые платежи (тогда пароли — тестовые из тех же настроек)
 *   ROBOKASSA_RECEIPT=true — передавать состав чека (мел + доставка); по умолчанию чек Robokassa формирует сама
 */
import crypto from "node:crypto";
import { productName } from "@/config/products";
import { PRODUCT } from "@/config/site";
import type { Order } from "@/lib/orders/types";
import { paymentMetadataFor, type PaymentShipmentMeta } from "./yookassa";

const PAY_URL = "https://auth.robokassa.ru/Merchant/Index.aspx";
const STATE_URL = "https://auth.robokassa.ru/Merchant/WebService/Service.asmx/OpStateExt";

const HASHES = ["md5", "sha1", "sha256", "sha384", "sha512", "ripemd160"] as const;
type HashName = (typeof HASHES)[number];

export interface RobokassaConfig {
  login: string;
  password1: string;
  password2: string;
  hash: HashName;
  test: boolean;
  receipt: boolean;
}

export function robokassaConfig(): RobokassaConfig | null {
  const login = (process.env.ROBOKASSA_LOGIN ?? "").trim();
  const password1 = (process.env.ROBOKASSA_PASSWORD1 ?? "").trim();
  const password2 = (process.env.ROBOKASSA_PASSWORD2 ?? "").trim();
  if (!login || !password1 || !password2) return null;
  const h = (process.env.ROBOKASSA_HASH ?? "md5").trim().toLowerCase().replace(/-/g, "");
  return {
    login,
    password1,
    password2,
    hash: (HASHES as readonly string[]).includes(h) ? (h as HashName) : "md5",
    test: process.env.ROBOKASSA_TEST === "true" || process.env.ROBOKASSA_TEST === "1",
    receipt: process.env.ROBOKASSA_RECEIPT === "true",
  };
}

const digest = (hash: HashName, s: string) => crypto.createHash(hash).update(s, "utf8").digest("hex");

/** «:Shp_a=1:Shp_b=2» — пользовательские параметры по алфавиту, как требует Robokassa */
function shpTail(shp: Record<string, string>): string {
  return Object.keys(shp)
    .sort()
    .map((k) => `:${k}=${shp[k]}`)
    .join("");
}

/* ───────────────────────── Данные для накладной ───────────────────────── */

type Packed = { o: string; p?: string; c?: string; t?: string; k?: string; d?: string; i?: string; x?: string; q: string; u: string; n: string; f: string; e: string };

/** Данные для накладной СДЭК → короткая строка без спецсимволов (base64url от JSON) */
export function packShipmentMeta(m: PaymentShipmentMeta): string {
  const p: Packed = { o: m.orderId, q: m.qty, u: m.price, n: m.name, f: m.phone, e: m.email };
  if (m.pvz) p.p = m.pvz;
  if (m.city) p.c = m.city;
  if (m.tariff) p.t = m.tariff;
  if (m.cc) p.k = m.cc;
  if (m.tin) p.i = m.tin;
  if (m.kit) p.x = m.kit;
  // Текст колонки «Доставка» — сокращаем, чтобы ссылка на оплату не была слишком длинной
  if (m.delivery) p.d = m.delivery.slice(0, 160);
  return Buffer.from(JSON.stringify(p), "utf8").toString("base64url");
}

export function unpackShipmentMeta(s: string): PaymentShipmentMeta | null {
  try {
    const p = JSON.parse(Buffer.from(s, "base64url").toString("utf8")) as Packed;
    if (!p || typeof p.o !== "string") return null;
    return {
      orderId: p.o,
      pvz: p.p,
      city: p.c,
      tariff: p.t,
      cc: p.k,
      tin: p.i,
      kit: p.x,
      delivery: p.d,
      qty: String(p.q ?? ""),
      price: String(p.u ?? ""),
      name: String(p.n ?? ""),
      phone: String(p.f ?? ""),
      email: String(p.e ?? ""),
    };
  } catch {
    return null;
  }
}

/* ───────────────────────── Ссылка на оплату ───────────────────────── */

/** Начало отсчёта номеров счетов — 1 сентября 2026 (МСК) */
const INVOICE_EPOCH = Date.UTC(2026, 7, 31, 21, 0, 0);

/**
 * Номер счёта в Robokassa: секунды с 01.09.2026 × 8 + случайная цифра 0–7.
 * Укладывается в 32-битное целое (до ~2034 года) — на случай, если где-то у Robokassa действует старое ограничение.
 */
export function newInvoiceId(now = Date.now()): number {
  const seconds = Math.max(0, Math.floor((now - INVOICE_EPOCH) / 1000));
  return seconds * 8 + crypto.randomInt(8) + 1;
}

const money = (n: number) => n.toFixed(2);

/** Состав чека 54-ФЗ: мел и доставка отдельными строками */
function receiptFor(order: Order): string {
  const tax = process.env.ROBOKASSA_TAX || "none";
  const items: Record<string, unknown>[] = [
    {
      name: (order.product === "kit" ? productName("kit", order.tip) : PRODUCT.name).slice(0, 128),
      quantity: order.quantity,
      sum: Number(money(order.itemsTotal)),
      payment_method: "full_payment",
      payment_object: "commodity",
      tax,
    },
  ];
  if (order.deliveryCost > 0) {
    items.push({
      name: "Доставка СДЭК до пункта выдачи",
      quantity: 1,
      sum: Number(money(order.deliveryCost)),
      payment_method: "full_payment",
      payment_object: "service",
      tax,
    });
  }
  const receipt: Record<string, unknown> = { items };
  if (process.env.ROBOKASSA_SNO) receipt.sno = process.env.ROBOKASSA_SNO;
  return JSON.stringify(receipt);
}

export interface RobokassaPayment {
  invoiceId: number;
  /** Номер платежа для страницы статуса: «rk-<номер счёта>» */
  paymentId: string;
  /** Ссылка на оплату (GET) — запасной вариант */
  url: string;
  /** Те же поля для отправки формой POST — так не упираемся в длину ссылки (например, с составом чека) */
  form: { action: string; fields: Record<string, string> };
  test: boolean;
}

/** Подписанная ссылка на страницу оплаты Robokassa (запроса к Robokassa не делает) */
export function createRobokassaPayment(order: Order, cfg: RobokassaConfig | null = robokassaConfig()): RobokassaPayment {
  if (!cfg) throw new Error("Robokassa не настроена (ROBOKASSA_LOGIN / ROBOKASSA_PASSWORD1 / ROBOKASSA_PASSWORD2)");
  const invoiceId = newInvoiceId();
  const outSum = money(order.total);
  const shp = { Shp_data: packShipmentMeta(paymentMetadataFor(order)), Shp_order: order.id };
  // Состав чека: в подписи — URL-кодированная строка, в ссылке она кодируется ещё раз
  const receipt = cfg.receipt ? encodeURIComponent(receiptFor(order)) : "";
  const signature = digest(
    cfg.hash,
    [cfg.login, outSum, String(invoiceId), ...(receipt ? [receipt] : []), cfg.password1].join(":") + shpTail(shp),
  );
  const fields: Record<string, string> = {
    MerchantLogin: cfg.login,
    OutSum: outSum,
    InvId: String(invoiceId),
    Description: `Заказ ${order.id}: ${order.product === "kit" ? "подарочный набор" : "мел"} Kamui x Abramov, ${order.quantity} шт.${order.deliveryCost > 0 ? " и доставка СДЭК" : ""}`.slice(0, 100),
    SignatureValue: signature,
    Culture: "ru",
    Encoding: "utf-8",
    Email: order.customer.email,
    ...(receipt ? { Receipt: receipt } : {}),
    ...(cfg.test ? { IsTest: "1" } : {}),
    ...shp,
  };
  return {
    invoiceId,
    paymentId: `rk-${invoiceId}`,
    url: `${PAY_URL}?${new URLSearchParams(fields)}`,
    form: { action: PAY_URL, fields },
    test: cfg.test,
  };
}

/* ───────────────────────── Уведомления и возврат покупателя ───────────────────────── */

export interface RobokassaCallback {
  outSum: string;
  invoiceId: string;
  /** Параметры Shp_* как пришли */
  shp: Record<string, string>;
  orderId: string;
  meta: PaymentShipmentMeta | null;
  test: boolean;
}

/** Параметры запроса Robokassa (GET или POST-форма) → обычный объект */
export async function readParams(request: Request): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  new URL(request.url).searchParams.forEach((v, k) => (out[k] = v));
  if (request.method === "POST") {
    const type = request.headers.get("content-type") ?? "";
    const body = await request.text().catch(() => "");
    if (type.includes("json")) {
      try {
        for (const [k, v] of Object.entries(JSON.parse(body) as Record<string, unknown>)) out[k] = String(v);
      } catch {
        /* не JSON */
      }
    } else {
      new URLSearchParams(body).forEach((v, k) => (out[k] = v));
    }
  }
  return out;
}

function checkSignature(params: Record<string, string>, password: string, cfg: RobokassaConfig): RobokassaCallback | null {
  const outSum = params.OutSum ?? params.out_summ ?? "";
  const invoiceId = params.InvId ?? params.inv_id ?? "";
  const given = (params.SignatureValue ?? params.crc ?? "").toLowerCase();
  if (!outSum || !/^\d{1,19}$/.test(invoiceId) || !given) return null;
  const shp: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) if (/^shp_/i.test(k)) shp[k] = v;
  const expected = digest(cfg.hash, `${outSum}:${invoiceId}:${password}${shpTail(shp)}`);
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const data = shp.Shp_data ?? shp.shp_data ?? "";
  const meta = data ? unpackShipmentMeta(data) : null;
  return {
    outSum,
    invoiceId,
    shp,
    orderId: shp.Shp_order ?? shp.shp_order ?? meta?.orderId ?? "",
    meta,
    test: params.IsTest === "1" || cfg.test,
  };
}

/** Result URL: подпись паролем №2. null — подпись неверна. */
export function verifyResult(params: Record<string, string>, cfg: RobokassaConfig | null = robokassaConfig()) {
  return cfg ? checkSignature(params, cfg.password2, cfg) : null;
}

/** Success URL: подпись паролем №1. null — подпись неверна. */
export function verifySuccess(params: Record<string, string>, cfg: RobokassaConfig | null = robokassaConfig()) {
  return cfg ? checkSignature(params, cfg.password1, cfg) : null;
}

/* ───────────────────────── Статус платежа ───────────────────────── */

export type RobokassaState =
  | {
      found: true;
      code: number;
      status: "succeeded" | "pending" | "canceled";
      outSum?: number;
      orderId?: string;
      /** Данные для накладной из параметра Shp_data счёта */
      meta?: PaymentShipmentMeta | null;
    }
  | { found: false; resultCode: number; error?: string };

/**
 * Статус счёта (XML-интерфейс OpStateExt). Коды состояния:
 * 5 — только создан, 10 — отменён, 50 — деньги получены и зачисляются, 60 — возвращены,
 * 80 — приостановлен, 100 — оплачен.
 */
export async function getRobokassaState(
  invoiceId: string | number,
  cfg: RobokassaConfig | null = robokassaConfig(),
): Promise<RobokassaState> {
  if (!cfg) throw new Error("Robokassa не настроена");
  const id = String(invoiceId);
  const q = new URLSearchParams({
    MerchantLogin: cfg.login,
    InvoiceID: id,
    Signature: digest(cfg.hash, `${cfg.login}:${id}:${cfg.password2}`),
  });
  // Тестовые платежи этот интерфейс не показывает — их подтверждает только уведомление Result URL
  const res = await fetch(`${STATE_URL}?${q}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const xml = await res.text();
  if (!res.ok) throw new Error(`Robokassa ${res.status}: ${xml.slice(0, 200)}`);
  const tag = (path: string) => {
    const m = xml.match(new RegExp(`<${path}>\\s*<Code>(\\d+)</Code>`));
    return m ? Number(m[1]) : null;
  };
  const resultCode = tag("Result");
  const stateCode = tag("State");
  if (resultCode !== 0 || stateCode === null) {
    const desc = xml.match(/<Description>([^<]*)<\/Description>/)?.[1];
    return { found: false, resultCode: resultCode ?? -1, error: desc };
  }
  const outSum = Number(xml.match(/<OutSum>([\d.]+)<\/OutSum>/)?.[1]);
  // Пользовательские параметры счёта (Shp_order) — чтобы сверить, что счёт относится к заказу
  const fields: Record<string, string> = {};
  for (const m of xml.matchAll(/<Field>\s*<Name>([^<]*)<\/Name>\s*<Value>([^<]*)<\/Value>\s*<\/Field>/g)) fields[m[1].toLowerCase()] = m[2];
  const decode = (v: string) => v.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return {
    found: true,
    orderId: fields.shp_order ? decode(fields.shp_order) : undefined,
    meta: fields.shp_data ? unpackShipmentMeta(decode(fields.shp_data)) : null,
    code: stateCode,
    status: stateCode === 100 ? "succeeded" : stateCode === 10 || stateCode === 60 ? "canceled" : "pending",
    ...(Number.isFinite(outSum) ? { outSum } : {}),
  };
}

/** Текст колонки «Платёж» в таблице. Начинается с «Robokassa» только у оплаченных боевых платежей —
 *  по этому признаку формула в листе «Настройки» считает проданные через Robokassa штуки. */
export function robokassaPaymentLabel(cb: Pick<RobokassaCallback, "invoiceId" | "outSum" | "test">): string {
  const sum = `${Math.round(Number(cb.outSum)).toLocaleString("ru-RU")} ₽`;
  return cb.test ? `ТЕСТ · Robokassa · ${sum} · счёт ${cb.invoiceId}` : `Robokassa · оплачено ${sum} · счёт ${cb.invoiceId}`;
}
