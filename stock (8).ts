import { features } from "@/config/features";
import { SOLD_COUNT, TOTAL_STOCK } from "@/config/stock";
import { fetchStockFromSheet } from "./orders/stores/google-sheets";

export interface Stock {
  total: number;
  sold: number;
  remaining: number;
  soldOut: boolean;
  source: "sheet" | "config";
}

const build = (total: number, sold: number, source: Stock["source"]): Stock => {
  const remaining = Math.max(0, total - sold);
  return { total, sold, remaining, soldOut: remaining === 0, source };
};

/**
 * Текущий остаток: Осталось = TOTAL_STOCK − SOLD_COUNT.
 * Берётся из листа «Настройки» Google Таблицы (если подключена), иначе из src/config/stock.ts.
 */
export async function getStock(opts: { fresh?: boolean } = {}): Promise<Stock> {
  if (features.googleSheets && process.env.STOCK_FROM_SHEET !== "false") {
    try {
      const { total, sold } = await fetchStockFromSheet(opts);
      return build(total, sold, "sheet");
    } catch (err) {
      console.warn("[stock] Не удалось получить остаток из таблицы, беру значения из конфига:", (err as Error).message);
    }
  }
  return build(TOTAL_STOCK, SOLD_COUNT, "config");
}
