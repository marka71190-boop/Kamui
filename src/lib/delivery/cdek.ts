/**
 * СДЭК — доставка до пункта выдачи (API v2).
 * Документация: https://api-docs.cdek.ru/
 *
 *   • поиск города          suggestCities("Красн") / suggestCities("Минс", "BY")
 *   • список ПВЗ            getPickupPoints(cityCode)
 *   • расчёт доставки       calculateDelivery({ toCityCode, quantity })
 *   • создание отправления  createShipment({...}) → uuid (после оплаты, из вебхука ЮKassa)
 *   • номер отправления     getTrackingNumber(uuid)
 *
 * Включение: CDEK_ENABLED=true + CDEK_CLIENT_ID + CDEK_CLIENT_SECRET + CDEK_FROM_CITY_CODE (+ CDEK_SHIPMENT_POINT).
 * Для тестов: CDEK_TEST_MODE=true — запросы идут в учебную среду api.edu.cdek.ru.
 */
import { cdekCountry, DEFAULT_CDEK_COUNTRY } from "@/config/cdek-countries";
import { PRODUCT, SELLER, SITE } from "@/config/site";
import { KIT, productName, type ProductId } from "@/config/products";

const BASE = () =>
  (
    process.env.CDEK_API_URL ||
    (process.env.CDEK_TEST_MODE === "true" ? "https://api.edu.cdek.ru/v2" : "https://api.cdek.ru/v2")
  ).replace(/\/$/, "");

/**
 * Упаковка одного мела: 26 × 18 × 1 см, 23 г.
 * Несколько штук складываются стопкой — растёт высота и вес.
 */
/** Число из настройки: пусто, не число или ≤ 0 — значение по умолчанию */
const envNum = (v: string | undefined, def: number, allowZero = false) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) && (allowZero ? n >= 0 : n > 0) ? n : def;
};

export const PACKAGE = {
  /** Вес одной штуки в упаковке, г */
  itemWeight: envNum(process.env.CDEK_ITEM_WEIGHT_G, 23),
  /** Дополнительный вес коробки/пакета на всю посылку, г */
  boxWeight: envNum(process.env.CDEK_BOX_WEIGHT_G, 0, true),
  /** Габариты одной штуки, см */
  length: envNum(process.env.CDEK_ITEM_LENGTH_CM, 26),
  width: envNum(process.env.CDEK_ITEM_WIDTH_CM, 18),
  height: envNum(process.env.CDEK_ITEM_HEIGHT_CM, 1),
};

/**
 * Подарочный набор: коробка с мелом, фото, салфеткой и наклейкой. Каждый набор — отдельное место в посылке.
 * Размеры и вес задаются переменными CDEK_KIT_* (по умолчанию 30 × 22 × 8 см, 400 г).
 */
export const KIT_PACKAGE = {
  weight: envNum(process.env.CDEK_KIT_WEIGHT_G, 400),
  length: envNum(process.env.CDEK_KIT_LENGTH_CM, 30),
  width: envNum(process.env.CDEK_KIT_WIDTH_CM, 22),
  height: envNum(process.env.CDEK_KIT_HEIGHT_CM, 8),
};

/** Тариф «Посылка склад-склад» (от ПВЗ отправителя до ПВЗ получателя). */
export const DEFAULT_TARIFF = () => Number(process.env.CDEK_TARIFF_CODE || 136);

let token: { value: string; expiresAt: number; base: string } | null = null;

async function getToken(): Promise<string> {
  const base = BASE();
  if (token && token.base === base && token.expiresAt > Date.now() + 60_000) return token.value;
  const id = process.env.CDEK_CLIENT_ID;
  const secret = process.env.CDEK_CLIENT_SECRET;
  if (!id || !secret) throw new Error("СДЭК не настроен (CDEK_CLIENT_ID / CDEK_CLIENT_SECRET)");
  const res = await fetch(`${base}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !data.access_token) throw new Error(`СДЭК: не удалось авторизоваться (HTTP ${res.status})`);
  token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000, base };
  return token.value;
}

export class CdekError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE() + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${await getToken()}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let data: (T & { errors?: { code?: string; message: string }[] }) | undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    /* не JSON */
  }
  if (!res.ok || !data) {
    const msg = data?.errors?.map((e) => e.message).join("; ") || text.slice(0, 200) || "ошибка";
    throw new CdekError(`СДЭК ${res.status}: ${msg}`, res.status);
  }
  return data;
}

const phoneForCdek = (phone: string) => "+" + phone.replace(/\D/g, "");

/* ───────────────────────── Города ───────────────────────── */

export interface CdekCity {
  code: number;
  /** «Краснодар, Краснодарский край» */
  name: string;
}

/**
 * Подсказки городов для поля ввода.
 * country — код страны доставки (RU, BY, KZ, AM, KG). Для России название страны в конце убираем
 * («Краснодар, Краснодарский край»), для остальных оставляем («Минск, Беларусь») — так её видно в таблице.
 */
export async function suggestCities(query: string, country: string = DEFAULT_CDEK_COUNTRY): Promise<CdekCity[]> {
  const cc = cdekCountry(country);
  const tidy = (name: string) => {
    const n = name.replace(/\s+/g, " ").trim();
    if (cc.code === "RU") return n.replace(/, Россия$/, "");
    return n.toLowerCase().includes(cc.name.toLowerCase()) ? n : `${n}, ${cc.name}`;
  };
  try {
    const q = new URLSearchParams({ name: query, country_code: cc.code });
    const list = await api<Array<{ code: number; full_name?: string; city?: string; region?: string }>>(
      `/location/suggest/cities?${q}`,
    );
    return list
      .filter((c) => Number.isInteger(c.code))
      .slice(0, 10)
      .map((c) => ({ code: c.code, name: tidy(c.full_name ?? [c.city, c.region].filter(Boolean).join(", ")) }));
  } catch (err) {
    // Запасной вариант — справочник городов
    if (err instanceof CdekError && err.status >= 500) throw err;
    const q = new URLSearchParams({ city: query, country_codes: cc.code, size: "10" });
    const list = await api<Array<{ code: number; city: string; region?: string }>>(`/location/cities?${q}`);
    return list.map((c) => ({ code: c.code, name: tidy([c.city, c.region].filter(Boolean).join(", ")) }));
  }
}

/* ───────────────────────── Пункты выдачи ───────────────────────── */

export interface CdekPickupPoint {
  code: string;
  name: string;
  address: string;
  workTime?: string;
  latitude?: number;
  longitude?: number;
  /** Код страны пункта (RU, BY, …) */
  countryCode?: string;
}

type RawPoint = {
  code: string;
  name: string;
  work_time?: string;
  location: {
    country_code?: string;
    city_code?: number;
    address_full?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
  };
};

const toPoint = (p: RawPoint): CdekPickupPoint => ({
  code: p.code,
  name: p.name,
  address: p.location?.address ?? p.location?.address_full ?? "",
  workTime: p.work_time,
  latitude: p.location?.latitude,
  longitude: p.location?.longitude,
  countryCode: p.location?.country_code,
});

const pointsCache = new Map<number, { at: number; points: CdekPickupPoint[] }>();

export async function getPickupPoints(cityCode: number): Promise<CdekPickupPoint[]> {
  const cached = pointsCache.get(cityCode);
  if (cached && Date.now() - cached.at < 30 * 60 * 1000) return cached.points;
  const q = new URLSearchParams({ city_code: String(cityCode), type: "PVZ", is_handout: "true" });
  const list = await api<RawPoint[]>(`/deliverypoints?${q}`);
  const points = list.map(toPoint).sort((a, b) => a.address.localeCompare(b.address, "ru"));
  if (pointsCache.size > 200) pointsCache.clear();
  pointsCache.set(cityCode, { at: Date.now(), points });
  return points;
}

/** Проверяет, что ПВЗ существует, выдаёт посылки и находится в этом городе. */
export async function findPickupPoint(cityCode: number, code: string): Promise<CdekPickupPoint | null> {
  const list = await api<RawPoint[]>(`/deliverypoints?${new URLSearchParams({ code })}`);
  const p = list.find((x) => x.code === code);
  if (!p) return null;
  if (p.location?.city_code && p.location.city_code !== cityCode) return null;
  return toPoint(p);
}

/* ───────────────────────── Расчёт ───────────────────────── */

/** Мел: все штуки одной стопкой в одном месте посылки */
export const packageFor = (quantity: number) => ({
  weight: Math.max(1, Math.round(PACKAGE.boxWeight + PACKAGE.itemWeight * quantity)),
  length: Math.max(1, Math.ceil(PACKAGE.length)),
  width: Math.max(1, Math.ceil(PACKAGE.width)),
  height: Math.max(1, Math.ceil(PACKAGE.height * quantity)),
});

/** Одна коробка подарочного набора */
const kitBox = () => ({
  weight: Math.max(1, Math.round(KIT_PACKAGE.weight)),
  length: Math.max(1, Math.ceil(KIT_PACKAGE.length)),
  width: Math.max(1, Math.ceil(KIT_PACKAGE.width)),
  height: Math.max(1, Math.ceil(KIT_PACKAGE.height)),
});

/** Места посылки: мел — одно место; наборы — каждый набор отдельным местом (коробка) */
export const packagesFor = (quantity: number, product: ProductId = "chalk") =>
  product === "kit" ? Array.from({ length: Math.max(1, quantity) }, kitBox) : [packageFor(quantity)];

export interface CdekQuote {
  /** Стоимость доставки по тарифу вместе со страховкой объявленной стоимости, ₽ (округлена вверх до рубля) */
  cost: number;
  /** Из неё страховка объявленной стоимости, ₽ */
  insurance: number;
  periodMin: number;
  periodMax: number;
  tariffCode: number;
}

/** Страховка объявленной стоимости: СДЭК берёт её с интернет-магазинов за каждую посылку (CDEK_INSURANCE=false — не учитывать) */
const insuranceOn = () => process.env.CDEK_INSURANCE !== "false";
/** Запасной расчёт страховки, если калькулятор не принял услугу: % от объявленной стоимости (по умолчанию 0,75%) */
const insurancePercent = () => {
  const v = Number(process.env.CDEK_INSURANCE_PERCENT ?? 0.75);
  return Number.isFinite(v) && v >= 0 ? v : 0.75;
};

type TariffResponse = {
  total_sum: number;
  delivery_sum?: number;
  period_min: number;
  period_max: number;
  services?: { code: string; sum: number }[];
};

/**
 * Стоимость доставки по тарифу. declaredValue — объявленная стоимость товаров, ₽ (то же, что попадёт в накладную):
 * СДЭК добавляет к доставке страховку от неё, поэтому считаем сразу с услугой INSURANCE.
 */
export async function calculateDelivery({
  toCityCode,
  quantity,
  product = "chalk",
  tariffCode = DEFAULT_TARIFF(),
  declaredValue = 0,
}: {
  toCityCode: number;
  quantity: number;
  /** Мел или подарочный набор — от этого зависят размеры и вес посылки */
  product?: ProductId;
  tariffCode?: number;
  declaredValue?: number;
}): Promise<CdekQuote> {
  const fromCode = Number(process.env.CDEK_FROM_CITY_CODE || 0);
  if (!fromCode) throw new Error("Укажите CDEK_FROM_CITY_CODE — код города отправки");
  const declared = insuranceOn() ? Math.max(0, Math.round(declaredValue)) : 0;
  const request = (withInsurance: boolean) =>
    api<TariffResponse>("/calculator/tariff", {
      method: "POST",
      body: JSON.stringify({
        tariff_code: tariffCode,
        from_location: { code: fromCode },
        to_location: { code: toCityCode },
        packages: packagesFor(quantity, product),
        ...(withInsurance ? { services: [{ code: "INSURANCE", parameter: String(declared) }] } : {}),
      }),
    });

  let data: TariffResponse;
  let insurance = 0;
  if (declared > 0) {
    try {
      data = await request(true);
      const listed = data.services?.find((s) => s.code === "INSURANCE");
      insurance = Math.ceil(Number(listed?.sum) || 0);
      // Услугу молча не посчитали (в ответе её нет и итог равен доставке) — добавляем страховку по проценту
      if (!listed && data.delivery_sum != null && Number(data.total_sum) <= Number(data.delivery_sum)) {
        insurance = Math.ceil((declared * insurancePercent()) / 100);
        data = { ...data, total_sum: Number(data.total_sum) + insurance };
      }
    } catch (err) {
      // Калькулятор не принял услугу — считаем без неё и добавляем страховку по проценту
      if (!(err instanceof CdekError) || err.status >= 500) throw err;
      data = await request(false);
      insurance = Math.ceil((declared * insurancePercent()) / 100);
      data = { ...data, total_sum: Number(data.total_sum) + insurance };
    }
  } else {
    data = await request(false);
  }
  return {
    cost: Math.ceil(Number(data.total_sum) || 0),
    insurance,
    periodMin: data.period_min,
    periodMax: data.period_max,
    tariffCode,
  };
}

/* ───────────────────────── Отправления ───────────────────────── */

export interface ShipmentInput {
  orderId: string;
  quantity: number;
  unitPrice: number;
  pickupPointCode: string;
  tariffCode?: number;
  /** tin — ИИН / ПИН получателя (Казахстан, Кыргызстан) */
  recipient: { name: string; phone: string; email?: string; tin?: string };
  /** Страна пункта выдачи (RU по умолчанию). Для других стран в накладную добавляются поля международного заказа. */
  countryCode?: string;
  /** Подарочный набор: выбранная наклейка JOS (у мела — не задано) */
  kitTip?: string;
}

/** Поля накладной, которые СДЭК требует для заказов за пределы России (страны ЕАЭС — без таможни). */
function internationalFields() {
  const seller = `Россия, ${SELLER.legalAddress}`;
  return {
    date_invoice: new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10), // по Москве
    shipper_name: SELLER.name,
    shipper_address: `Россия, ${SELLER.actualAddress}`,
    seller: {
      name: SELLER.name,
      inn: SELLER.inn,
      ...(SELLER.phone ? { phone: SELLER.phone } : {}),
      address: seller,
    },
  };
}

const ITEM_INTL = {
  name_i18n: "Billiard chalk Kamui x Iosif Abramov 0.98 beta",
  brand: "Kamui",
  country_code: "JP",
  url: SITE.url,
};

export interface CdekShipmentRef {
  uuid: string;
  trackingNumber: string | null;
  /** Последний статус заказа в СДЭК: «Создан», «Принят на склад отправителя»… */
  status?: string;
  /** Код последнего статуса: CREATED, ACCEPTED, RECEIVED_AT_SHIPMENT_WAREHOUSE… */
  statusCode?: string;
  /** Когда посылка пришла в пункт выдачи (статус «Принят на склад до востребования» / «Помещён в постамат») */
  arrivedAt?: string;
  /** До какого числа бесплатно хранится в пункте выдачи, если СДЭК это сообщает */
  keepFreeUntil?: string;
}

type RawOrderEntity = {
  uuid: string;
  cdek_number?: string;
  statuses?: { code?: string; name?: string; date_time?: string }[];
  keep_free_until?: string;
};

/** Коды статусов СДЭК «посылка ждёт получателя» */
export const AT_PICKUP_CODES = ["ACCEPTED_AT_PICK_UP_POINT", "POSTOMAT_POSTED"];

const latest = (e: RawOrderEntity) =>
  [...(e.statuses ?? [])].sort((a, b) => String(b.date_time ?? "").localeCompare(String(a.date_time ?? "")))[0];
const latestStatus = (e: RawOrderEntity) => latest(e)?.name;

/** Ищет уже созданное отправление по номеру заказа — чтобы не создать дубль. */
export function findShipment(orderId: string): Promise<CdekShipmentRef | null> {
  return lookupShipment({ im_number: orderId });
}

/** Накладная по номеру СДЭК — для отправлений, оформленных вручную в личном кабинете */
export function findShipmentByNumber(cdekNumber: string): Promise<CdekShipmentRef | null> {
  return lookupShipment({ cdek_number: cdekNumber });
}

async function lookupShipment(q: Record<string, string>): Promise<CdekShipmentRef | null> {
  try {
    const data = await api<{ entity?: RawOrderEntity }>(`/orders?${new URLSearchParams(q)}`);
    const e = data.entity;
    if (!e?.uuid) return null;
    const arrived = [...(e.statuses ?? [])]
      .filter((s) => AT_PICKUP_CODES.includes(String(s.code)))
      .sort((a, b) => String(b.date_time ?? "").localeCompare(String(a.date_time ?? "")))[0];
    return {
      uuid: e.uuid,
      trackingNumber: e.cdek_number ?? null,
      status: latestStatus(e),
      statusCode: latest(e)?.code,
      ...(arrived?.date_time ? { arrivedAt: arrived.date_time } : {}),
      ...(e.keep_free_until ? { keepFreeUntil: e.keep_free_until } : {}),
    };
  } catch (err) {
    if (err instanceof CdekError && (err.status === 404 || err.status === 400)) return null;
    throw err;
  }
}

/** Создаёт отправление в СДЭК (заказ уже оплачен онлайн). Возвращает UUID заказа СДЭК. */
export async function createShipment(input: ShipmentInput): Promise<string> {
  const shipmentPoint = process.env.CDEK_SHIPMENT_POINT;
  if (!shipmentPoint) throw new Error("Укажите CDEK_SHIPMENT_POINT — код ПВЗ, где вы сдаёте посылки");
  const kit = Boolean(input.kitTip);
  const intl = Boolean(input.countryCode && input.countryCode !== "RU");
  const data = await api<{ entity?: { uuid: string } }>("/orders", {
    method: "POST",
    body: JSON.stringify({
      type: 1, // интернет-магазин
      number: input.orderId,
      tariff_code: input.tariffCode ?? DEFAULT_TARIFF(),
      shipment_point: shipmentPoint,
      delivery_point: input.pickupPointCode,
      delivery_recipient_cost: { value: 0 }, // доставка оплачена на сайте
      ...(intl ? internationalFields() : {}),
      recipient: {
        name: input.recipient.name,
        ...(input.recipient.email ? { email: input.recipient.email } : {}),
        ...(input.recipient.tin ? { tin: input.recipient.tin } : {}),
        phones: [{ number: phoneForCdek(input.recipient.phone) }],
      },
      // Мел — одно место со всеми штуками; наборы — каждый в своей коробке, отдельным местом
      packages: packagesFor(input.quantity, kit ? "kit" : "chalk").map((pkg, i) => ({
        number: String(i + 1),
        ...pkg,
        items: [
          {
            name: kit ? productName("kit", input.kitTip) : PRODUCT.name,
            ware_key: kit ? `${KIT.sku}-${input.kitTip}` : PRODUCT.sku,
            payment: { value: 0 }, // товар оплачен онлайн
            cost: input.unitPrice,
            weight: kit ? pkg.weight : Math.max(1, Math.round(PACKAGE.itemWeight)),
            amount: kit ? 1 : input.quantity,
            ...(intl ? { ...ITEM_INTL, ...(kit ? { name_i18n: KIT.nameIntl } : {}) } : {}),
          },
        ],
      })),
    }),
  });
  if (!data.entity?.uuid) throw new Error("СДЭК не вернул UUID заказа");
  return data.entity.uuid;
}

/** Заказ не прошёл проверку СДЭК (например, не хватает данных) — накладную нужно оформить вручную. */
export class CdekOrderRejected extends Error {}

/**
 * Номер отправления (трек-номер) появляется через несколько секунд после регистрации заказа в СДЭК.
 * Если СДЭК отклонил заказ при проверке — бросает CdekOrderRejected с текстом ошибки.
 */
export async function getTrackingNumber(orderUuid: string): Promise<string | null> {
  const data = await api<{
    entity?: { cdek_number?: string };
    requests?: { type?: string; state?: string; errors?: { code?: string; message?: string }[] }[];
  }>(`/orders/${encodeURIComponent(orderUuid)}`);
  if (data.entity?.cdek_number) return data.entity.cdek_number;
  const rejected = data.requests?.find((r) => r.type === "CREATE" && r.state === "INVALID");
  if (rejected) {
    const why = rejected.errors?.map((e) => e.message || e.code).filter(Boolean).join("; ") || "заказ не прошёл проверку";
    throw new CdekOrderRejected(`СДЭК отклонил заказ: ${why}`);
  }
  return null;
}

/** Ждёт трек-номер до ~waitMs миллисекунд. */
export async function waitForTrackingNumber(orderUuid: string, waitMs = 8_000): Promise<string | null> {
  const until = Date.now() + waitMs;
  for (;;) {
    try {
      const n = await getTrackingNumber(orderUuid);
      if (n) return n;
    } catch (err) {
      if (err instanceof CdekOrderRejected) throw err;
      /* регистрация ещё идёт */
    }
    if (Date.now() + 2_000 > until) return null;
    await new Promise((r) => setTimeout(r, 2_000));
  }
}
