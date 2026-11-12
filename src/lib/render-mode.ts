import { connection } from "next/server";

/**
 * Свой сервер (Timeweb Cloud): ключи СДЭК/ЮKassa/таблицы задаются в панели и доступны только при запуске,
 * а не при сборке. Поэтому там (KAMUI_DYNAMIC_PAGES=1 в Dockerfile) страницы с товаром собираются
 * на каждый запрос — данные при этом всё равно берутся из кэша, так что это быстро.
 * На Vercel переменная не задана — страницы, как и раньше, обновляются раз в минуту.
 */
export async function renderPerRequestOnOwnServer(): Promise<void> {
  if (process.env.KAMUI_DYNAMIC_PAGES === "1") await connection();
}
