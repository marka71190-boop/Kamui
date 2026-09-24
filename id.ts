/**
 * Номер заказа: KA-ГГММДД-XXXX, например KA-260924-7QX4.
 * Дата — по Москве, суффикс — 4 случайных символа без похожих букв/цифр (≈1 млн вариантов в день).
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateOrderId(now: Date = new Date()): string {
  const msk = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const yy = String(msk.getUTCFullYear()).slice(2);
  const mm = String(msk.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(msk.getUTCDate()).padStart(2, "0");
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `KA-${yy}${mm}${dd}-${suffix}`;
}

export const ORDER_ID_RE = /^KA-\d{6}-[A-Z0-9]{4}$/;
