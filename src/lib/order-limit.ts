/**
 * Сколько мелков (и наборов) можно купить в одном заказе на сайте.
 * Меняется на странице «Продажи» (/sales) и хранится в базе (таблица settings, ключ max_per_order).
 * Не задано или база не подключена — PRODUCT.maxPerOrder из src/config/site.ts.
 * Больше этого числа — опт: покупателю показываются телефон, WhatsApp и Telegram.
 */
import { PRODUCT } from "@/config/site";
import { getSetting, setSetting } from "@/lib/db/settings";

const KEY = "max_per_order";
/** Больше трёх цифр поле количества на сайте не принимает */
export const MAX_PER_ORDER_LIMIT = 999;

const TTL_MS = 10_000;
let memo: { at: number; value: number } | null = null;

const valid = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_PER_ORDER_LIMIT;

export async function getMaxPerOrder(): Promise<number> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.value;
  let value: number = PRODUCT.maxPerOrder;
  try {
    const n = Number(await getSetting(KEY));
    if (valid(n)) value = n;
  } catch (err) {
    console.warn("[order-limit] Не удалось прочитать лимит, беру из конфига:", (err as Error).message);
  }
  memo = { at: Date.now(), value };
  return value;
}

export async function saveMaxPerOrder(n: number): Promise<void> {
  if (!valid(n)) throw new Error(`Количество должно быть от 1 до ${MAX_PER_ORDER_LIMIT}`);
  await setSetting(KEY, String(n));
  memo = { at: Date.now(), value: n };
}
