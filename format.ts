/** Форматирование чисел и цен для русской локали (без зависимости от Intl-данных в среде). */

export function formatNumber(n: number): string {
  const [int, frac] = String(Math.abs(Math.round(n * 100) / 100)).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (n < 0 ? "−" : "") + grouped + (frac ? "," + frac : "");
}

export function formatPrice(n: number): string {
  return `${formatNumber(n)} ₽`;
}

/** 1 → «штука», 2 → «штуки», 5 → «штук» */
export function plural(n: number, forms: [one: string, few: string, many: string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

export const pad2 = (n: number) => String(n).padStart(2, "0");
