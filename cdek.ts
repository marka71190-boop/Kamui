/**
 * СДЭК — заготовка под доставку (API v2).
 * Документация: https://api-docs.cdek.ru/
 *
 * Что уже готово:
 *   • поиск города          findCities("Краснодар")
 *   • список ПВЗ            getPickupPoints(cityCode)
 *   • расчёт доставки       calculateDelivery({ toCityCode, quantity })
 *   • создание отправления  createShipment(order, pickupPointCode) → uuid
 *   • номер отправления     getTrackingNumber(uuid)
 *
 * Включение: CDEK_ENABLED=true + CDEK_CLIENT_ID + CDEK_CLIENT_SECRET (+ CDEK_FROM_CITY_CODE).
 * Для тестов: CDEK_TEST_MODE=true — запросы идут в учебную среду api.edu.cdek.ru.
 */
import { PRODUCT, SELLER } from "@/config/site";
import type { Order } from "@/lib/orders/types";

const BASE = () => (process.env.CDEK_TEST_MODE === "true" ? "https://api.edu.cdek.ru/v2" : "https://api.cdek.ru/v2");

/** Габариты посылки. Уточните реальные значения упаковки. */
export const PACKAGE = {
  /** Вес одного мела в упаковке, г */
  itemWeight: Number(process.env.CDEK_ITEM_WEIGHT_G || 60),
  /** Вес коробки/пакета, г */
  boxWeight: 100,
  /** Габариты коробки, см */
  length: 15,
  width: 10,
  height: 8,
};

/** Тариф «Посылка склад-склад» (до ПВЗ). */
export const DEFAULT_TARIFF = Number(process.env.CDEK_TARIFF_CODE || 136);

let token: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const id = process.env.CDEK_CLIENT_ID;
  const secret = process.env.CDEK_CLIENT_SECRET;
  if (!id || !secret) throw new Error("СДЭК не настроен (CDEK_CLIENT_ID / CDEK_CLIENT_SECRET)");
  const res = await fetch(`${BASE()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!res.ok || !data.access_token) throw new Error(`СДЭК: не удалось авторизоваться (HTTP ${res.status})`);
  token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return token.value;
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
  const data = (await res.json()) as T & { errors?: { message: string }[] };
  if (!res.ok) throw new Error(`СДЭК ${res.status}: ${data.errors?.map((e) => e.message).join("; ") ?? "ошибка"}`);
  return data;
}

export interface CdekCity {
  code: number;
  city: string;
  region?: string;
}

export async function findCities(query: string): Promise<CdekCity[]> {
  const q = new URLSearchParams({ city: query, country_codes: "RU", size: "10" });
  const list = await api<Array<{ code: number; city: string; region?: string }>>(`/location/cities?${q}`);
  return list.map(({ code, city, region }) => ({ code, city, region }));
}

export interface CdekPickupPoint {
  code: string;
  name: string;
  address: string;
  workTime?: string;
  latitude?: number;
  longitude?: number;
}

export async function getPickupPoints(cityCode: number): Promise<CdekPickupPoint[]> {
  const q = new URLSearchParams({ city_code: String(cityCode), type: "PVZ" });
  const list = await api<
    Array<{
      code: string;
      name: string;
      work_time?: string;
      location: { address_full?: string; address?: string; latitude?: number; longitude?: number };
    }>
  >(`/deliverypoints?${q}`);
  return list.map((p) => ({
    code: p.code,
    name: p.name,
    address: p.location.address_full ?? p.location.address ?? "",
    workTime: p.work_time,
    latitude: p.location.latitude,
    longitude: p.location.longitude,
  }));
}

const packageFor = (quantity: number) => ({
  weight: PACKAGE.boxWeight + PACKAGE.itemWeight * quantity,
  length: PACKAGE.length,
  width: PACKAGE.width,
  height: PACKAGE.height,
});

export interface CdekQuote {
  cost: number;
  periodMin: number;
  periodMax: number;
  tariffCode: number;
}

export async function calculateDelivery({
  toCityCode,
  quantity,
  tariffCode = DEFAULT_TARIFF,
}: {
  toCityCode: number;
  quantity: number;
  tariffCode?: number;
}): Promise<CdekQuote> {
  const fromCode = Number(process.env.CDEK_FROM_CITY_CODE || 0);
  if (!fromCode) throw new Error("Укажите CDEK_FROM_CITY_CODE — код города отправки");
  const data = await api<{ total_sum: number; period_min: number; period_max: number }>("/calculator/tariff", {
    method: "POST",
    body: JSON.stringify({
      tariff_code: tariffCode,
      from_location: { code: fromCode },
      to_location: { code: toCityCode },
      packages: [packageFor(quantity)],
    }),
  });
  return { cost: data.total_sum, periodMin: data.period_min, periodMax: data.period_max, tariffCode };
}

/** Создаёт отправление в СДЭК. Возвращает UUID заказа СДЭК. */
export async function createShipment(
  order: Order,
  pickupPointCode: string,
  tariffCode = DEFAULT_TARIFF,
): Promise<string> {
  const shipmentPoint = process.env.CDEK_SHIPMENT_POINT;
  if (!shipmentPoint) throw new Error("Укажите CDEK_SHIPMENT_POINT — код ПВЗ, где вы сдаёте посылки");
  const pkg = packageFor(order.quantity);
  const data = await api<{ entity?: { uuid: string } }>("/orders", {
    method: "POST",
    body: JSON.stringify({
      type: 1, // интернет-магазин
      number: order.id,
      tariff_code: tariffCode,
      shipment_point: shipmentPoint,
      delivery_point: pickupPointCode,
      sender: { company: SELLER.name },
      recipient: {
        name: order.customer.name,
        email: order.customer.email,
        phones: [{ number: order.customer.phone.replace(/[^\d+]/g, "") }],
      },
      packages: [
        {
          number: "1",
          ...pkg,
          items: [
            {
              name: PRODUCT.name,
              ware_key: PRODUCT.sku,
              payment: { value: 0 }, // заказ оплачен онлайн
              cost: order.unitPrice,
              weight: PACKAGE.itemWeight,
              amount: order.quantity,
            },
          ],
        },
      ],
    }),
  });
  if (!data.entity?.uuid) throw new Error("СДЭК не вернул UUID заказа");
  return data.entity.uuid;
}

/** Номер отправления (трек-номер) появляется после регистрации заказа в СДЭК. */
export async function getTrackingNumber(orderUuid: string): Promise<string | null> {
  const data = await api<{ entity?: { cdek_number?: string } }>(`/orders/${encodeURIComponent(orderUuid)}`);
  return data.entity?.cdek_number ?? null;
}
