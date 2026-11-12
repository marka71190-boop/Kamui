/**
 * Хранилище заказов: пишем во все настроенные хранилища — база PostgreSQL (основное, DATABASE_URL),
 * Google Таблица (копия для просмотра) и локальный файл.
 * Заявка считается принятой, если сохранилась хотя бы в одном месте.
 */
import { features } from "@/config/features";
import { dbEnabled } from "@/lib/db/schema";
import type { Order, OrderPatch } from "./types";
import { fileStore } from "./stores/file";
import { googleSheetsStore } from "./stores/google-sheets";
import { postgresStore } from "./stores/postgres";

export interface OrderStore {
  name: string;
  save(order: Order): Promise<void>;
  update(id: string, patch: OrderPatch): Promise<void>;
}

function activeStores(): OrderStore[] {
  const stores: OrderStore[] = [];
  if (dbEnabled()) stores.push(postgresStore);
  if (features.fileStore) stores.push(fileStore);
  if (features.googleSheets) stores.push(googleSheetsStore);
  return stores;
}

export class OrderStorageError extends Error {}

export async function saveOrder(order: Order): Promise<string[]> {
  const stores = activeStores();
  if (stores.length === 0) {
    throw new OrderStorageError("Не настроено ни одно хранилище заявок (см. .env.example)");
  }
  const results = await Promise.allSettled(stores.map((s) => s.save(order)));
  const saved: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") saved.push(stores[i].name);
    else console.error(`[orders] Не удалось сохранить ${order.id} в «${stores[i].name}»:`, r.reason);
  });
  if (saved.length === 0) {
    // Последний рубеж: заявка останется в логах сервера.
    console.error("[orders] ЗАЯВКА НЕ СОХРАНЕНА:", JSON.stringify(order));
    throw new OrderStorageError("Не удалось сохранить заявку");
  }
  return saved;
}

export async function updateOrder(id: string, patch: OrderPatch): Promise<void> {
  const results = await Promise.allSettled(activeStores().map((s) => s.update(id, patch)));
  results.forEach((r) => {
    if (r.status === "rejected") console.error(`[orders] Не удалось обновить ${id}:`, r.reason);
  });
}

/**
 * То же, что updateOrder, но с ошибкой, если обновить не удалось ни в одном хранилище.
 * Нужна уведомлениям об оплате: пока отметка «Оплачена» не записана, платёжному сервису не отвечаем «OK» —
 * он повторит уведомление.
 */
export async function updateOrderStrict(id: string, patch: OrderPatch): Promise<void> {
  const stores = activeStores();
  const results = await Promise.allSettled(stores.map((s) => s.update(id, patch)));
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  failed.forEach((r) => console.error(`[orders] Не удалось обновить ${id}:`, r.reason));
  if (stores.length > 0 && failed.length === stores.length) throw failed[0].reason;
  // База — основное хранилище: если отметка не записалась в неё, платёжный сервис должен повторить уведомление
  const db = stores.findIndex((s) => s.name === "postgres");
  if (db >= 0 && results[db].status === "rejected") throw (results[db] as PromiseRejectedResult).reason;
}
