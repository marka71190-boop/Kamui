/**
 * Флаги интеграций. Всё выключено, пока не заданы ключи в переменных окружения.
 * Серверный модуль — не импортируйте его в клиентские компоненты.
 */

const on = (v: string | undefined) => v === "true" || v === "1";

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
};
