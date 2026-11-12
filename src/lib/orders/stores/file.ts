/**
 * Локальная копия заявок: data/orders.jsonl (одна строка — одно событие).
 * На своём сервере в РФ это основное хранилище (важно для 152-ФЗ — см. README).
 * На Vercel файловая система только для чтения — там используйте Google Sheets.
 */
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { OrderStore } from "../store";

function filePath() {
  return process.env.ORDERS_FILE_PATH || path.join(/* turbopackIgnore: true */ process.cwd(), "data", "orders.jsonl");
}

async function append(record: Record<string, unknown>) {
  const file = filePath();
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, JSON.stringify(record) + "\n", "utf8");
}

export const fileStore: OrderStore = {
  name: "file",
  async save(order) {
    await append({ type: "order", ...order });
  },
  async update(id, patch) {
    await append({ type: "update", id, at: new Date().toISOString(), ...patch });
  },
};
