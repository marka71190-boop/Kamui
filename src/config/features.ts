/**
 * Флаги интеграций. Всё выключено, пока не заданы ключи в переменных окружения.
 * Серверный модуль — не импортируйте его в клиентские компоненты
 * (в браузер передаётся только checkoutConfig()).
 */

import { CDEK_COUNTRIES, enabledCdekCountries, type CdekCountryCode } from "./cdek-countries";

const on = (v: string | undefined) => v === "true" || v === "1";

/** Добавка к наценке на доставку, процентных пунктов: прибавляется к DELIVERY_MARKUP_PERCENT (30 → 35) */
const DELIVERY_MARKUP_EXTRA = 5;

export const features = {
  /** Google Таблица с заказами (Apps Script веб-приложение) */
  get googleSheets() {
    return Boolean(process.env.GOOGLE_SHEETS_WEBHOOK_URL && process.env.GOOGLE_SHEETS_SECRET);
  },
  /** Локальная копия заявок в data/orders.jsonl (по умолчанию включена) */
  get fileStore() {
    return process.env.ORDERS_FILE_STORE !== "false";
  },
  /** Онлайн-оплата через ЮKassa */
  get payments() {
    return on(process.env.PAYMENTS_ENABLED) && Boolean(process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY);
  },
  /** Доставка СДЭК (ПВЗ, расчёт, создание отправлений) */
  get cdek() {
    return on(process.env.CDEK_ENABLED) && Boolean(process.env.CDEK_CLIENT_ID && process.env.CDEK_CLIENT_SECRET);
  },
  /**
   * Кто платит за доставку СДЭК:
   *   customer — покупатель, стоимость по тарифу СДЭК добавляется к заказу (по умолчанию);
   *   free     — продавец, для покупателя доставка бесплатная.
   */
  get freeDelivery() {
    return process.env.DELIVERY_PRICE_MODE === "free";
  },
  /**
   * Подключён тестовый магазин ЮKassa (секретный ключ начинается с test_).
   * Тогда оплата видна только по секретной ссылке ?paytest=<PAYMENTS_TEST_TOKEN>,
   * а обычные покупатели по-прежнему оставляют заявку без оплаты.
   */
  get paymentsTestShop() {
    return (process.env.YOOKASSA_SECRET_KEY ?? "").startsWith("test_");
  },
  /**
   * Наценка к тарифу СДЭК для покупателя, %: DELIVERY_MARKUP_PERCENT (например 30) + DELIVERY_MARKUP_EXTRA.
   * Покупатель видит только итоговую стоимость доставки.
   */
  get deliveryMarkupPercent() {
    const n = Number(process.env.DELIVERY_MARKUP_PERCENT || 0);
    return (Number.isFinite(n) && n > 0 ? n : 0) + DELIVERY_MARKUP_EXTRA;
  },
  /**
   * Robokassa — оплата заказов с доставкой за пределы России (карты зарубежных банков).
   * Нужны ROBOKASSA_LOGIN, ROBOKASSA_PASSWORD1, ROBOKASSA_PASSWORD2; выключить — ROBOKASSA_ENABLED=false.
   */
  get robokassa() {
    return (
      process.env.ROBOKASSA_ENABLED !== "false" &&
      Boolean(process.env.ROBOKASSA_LOGIN && process.env.ROBOKASSA_PASSWORD1 && process.env.ROBOKASSA_PASSWORD2)
    );
  },
  /**
   * Страны доставки СДЭК с оплатой на сайте. Россия — через ЮKassa, остальные — через Robokassa.
   * CDEK_COUNTRIES=RU,BY,KZ,AM,KG — явный список. Не задано: с Robokassa — все страны ЕАЭС, без неё — только Россия.
   */
  get cdekCountries(): CdekCountryCode[] {
    const all = CDEK_COUNTRIES.map((c) => c.code).join(",");
    return enabledCdekCountries(process.env.CDEK_COUNTRIES || (this.robokassa ? all : ""));
  },
  /** Robokassa в тестовом режиме (ROBOKASSA_TEST=true): страны за пределами России видны только по секретной ссылке ?paytest= */
  get robokassaTest() {
    return this.robokassa && (process.env.ROBOKASSA_TEST === "true" || process.env.ROBOKASSA_TEST === "1");
  },
  /** Страны доставки, которые видят все покупатели и которые упоминаются в текстах сайта */
  get publicCdekCountries(): CdekCountryCode[] {
    if (!this.cdek) return ["RU"];
    if (this.robokassaTest) return this.cdekCountries.filter((c) => c === "RU" || !this.robokassa);
    return this.cdekCountries;
  },
  /** После оплаты автоматически создавать отправление в СДЭК (по умолчанию — да). */
  get cdekAutoShipment() {
    return process.env.CDEK_AUTO_SHIPMENT !== "false";
  },
};

/** Настройки оформления заказа, которые нужны браузеру. */
export interface CheckoutConfig {
  /** Выбор ПВЗ СДЭК и расчёт доставки в форме */
  cdek: boolean;
  /** Онлайн-оплата сразу после оформления (для заказов по России) */
  payments: boolean;
  /** Подключён тестовый магазин: оплата только по секретной ссылке */
  paymentsTest: boolean;
  /** Доставка бесплатная для покупателя */
  freeDelivery: boolean;
  /** Страны доставки СДЭК (Россия всегда первая) */
  cdekCountries: CdekCountryCode[];
  /** Заказы за пределы России (СДЭК) оплачиваются через Robokassa */
  robokassa: boolean;
  /** Robokassa в тестовом режиме: страны за пределами России — только по секретной ссылке */
  robokassaTest: boolean;
  /** Цены для заказов из-за рубежа (оплата через Robokassa): мел в $, курс ЦБ для пересчёта в рубли */
  abroad?: { unitUsd: number; kitUsd: number; wholesaleUsd: number; rate: number };
}

export function checkoutConfig(): CheckoutConfig {
  const payments = features.payments;
  return {
    cdek: features.cdek,
    payments: payments && !features.paymentsTestShop,
    paymentsTest: payments && features.paymentsTestShop,
    freeDelivery: features.freeDelivery,
    cdekCountries: features.cdek ? features.cdekCountries : ["RU"],
    robokassa: features.robokassa,
    robokassaTest: features.robokassaTest,
  };
}
