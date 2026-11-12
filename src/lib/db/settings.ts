/** Служебные отметки в базе (таблица settings): когда пришло последнее уведомление ЮKassa и т. п. */
import { sql } from "./pg";
import { dbEnabled, ensureSchema } from "./schema";

export async function getSetting(key: string): Promise<string | null> {
  if (!dbEnabled()) return null;
  await ensureSchema();
  return (await sql<{ value: string }>("select value from settings where key = $1", [key])).rows[0]?.value ?? null;
}

/** Записать отметку; ошибки базы не мешают основной работе */
export async function setSetting(key: string, value: string): Promise<void> {
  if (!dbEnabled()) return;
  try {
    await ensureSchema();
    await sql(
      "insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value, updated_at = now()",
      [key, value],
    );
  } catch (err) {
    console.error(`[db] Не удалось записать ${key}:`, (err as Error).message);
  }
}
