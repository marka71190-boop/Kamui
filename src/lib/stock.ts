import { features } from "@/config/features";
import { SOLD_COUNT, TOTAL_STOCK } from "@/config/stock";
import { paidQuantity } from "@/lib/payments/yookassa";
import { fetchStockFromSheet } from "./orders/stores/google-sheets";

export interface Stock {
  total: number;
  sold: number;
  remaining: number;
  soldOut: boolean;
  source: "sheet" | "config";
  /** Продано вне сайта — число SOLD_COUNT из таблицы (или конфига) */
  soldManual: number;
  /** Оплачено на сайте через ЮKassa (null — не удалось узнать) */
  soldOnline: number | null;
}

/** Остаток для показа на странице (без служебных полей). */
export type StockView = Pick<Stock, "total" | "sold" | "remaining" | "soldOut">;

/** Последнее удачное значение «оплачено на сайте» — если ЮKassa на минуту недоступна, счётчик не прыгает назад. */
let lastOnline: number | null = null;

async function soldOnline(opts: { fresh?: boolean }): Promise<number | null> {
  if (!features.payments || features.paymentsTestShop || process.env.STOCK_COUNT_PAID === "false") return 0;
  try {
    const { quantity } = await paidQuantity(opts);
    lastOnline = quantity;
    return quantity;
  } catch (err) {
    console.warn("[stock] Не удалось посчитать оплаченные заказы:", (err as Error).message);
    return lastOnline;
  }
}

/** Последний удачно прочитанный лист «Настройки» и последняя ошибка чтения (для /pay-check). */
let lastSheet: { total: number; sold: number } | null = null;
let lastSheetError: string | null = null;
export const stockDiagnostics = () => ({ lastSheetError });

async function manualStock(opts: { fresh?: boolean }): Promise<{ total: number; sold: number; source: Stock["source"] }> {
  if (features.googleSheets && process.env.STOCK_FROM_SHEET !== "false") {
    try {
      lastSheet = await fetchStockFromSheet(opts);
      lastSheetError = null;
      return { ...lastSheet, source: "sheet" };
    } catch (err) {
      lastSheetError = `${new Date().toISOString()} ${(err as Error).name}: ${(err as Error).message}`;
      console.warn("[stock] Не удалось получить остаток из таблицы:", lastSheetError);
    }
    // Таблица не ответила: берём последнее известное значение, а не цифры из конфига
    if (lastSheet) return { ...lastSheet, source: "sheet" };
    if (opts.fresh) {
      try {
        lastSheet = await fetchStockFromSheet({ fresh: false });
        return { ...lastSheet, source: "sheet" };
      } catch {
        /* ниже — конфиг */
      }
    }
  }
  return { total: TOTAL_STOCK, sold: SOLD_COUNT, source: "config" };
}

/**
 * Текущий остаток: Осталось = TOTAL_STOCK − (SOLD_COUNT + оплачено на сайте).
 *   TOTAL_STOCK и SOLD_COUNT — лист «Настройки» Google Таблицы (если подключена), иначе src/config/stock.ts.
 *   SOLD_COUNT — продажи вне сайта; заказы, оплаченные на сайте через ЮKassa, прибавляются автоматически.
 */
export async function getStock(opts: { fresh?: boolean } = {}): Promise<Stock> {
  const [manual, online] = await Promise.all([manualStock(opts), soldOnline(opts)]);
  const total = Math.max(0, manual.total);
  const sold = Math.min(total, Math.max(0, manual.sold) + (online ?? 0));
  const remaining = Math.max(0, total - sold);
  return {
    total,
    sold,
    remaining,
    soldOut: remaining === 0,
    source: manual.source,
    soldManual: manual.sold,
    soldOnline: online,
  };
}
