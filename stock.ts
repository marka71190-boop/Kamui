/**
 * ⚙️  АДМИНСКИЕ ПЕРЕМЕННЫЕ ОСТАТКА
 *
 *   Осталось = TOTAL_STOCK − SOLD_COUNT
 *
 * Где менять (по убыванию приоритета):
 *   1. Google Таблица «Kamui Collection — Заказы», лист «Настройки» —
 *      сайт подхватит новые цифры в течение минуты, без передеплоя.
 *   2. Переменные окружения TOTAL_STOCK и SOLD_COUNT (файл .env.local / панель хостинга).
 *   3. Значения по умолчанию ниже.
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Всего выпущено экземпляров */
export const TOTAL_STOCK = envInt("TOTAL_STOCK", 2000);

/** Уже продано */
export const SOLD_COUNT = envInt("SOLD_COUNT", 49);

/** Остаток по умолчанию (формула) */
export const REMAINING = Math.max(0, TOTAL_STOCK - SOLD_COUNT);
