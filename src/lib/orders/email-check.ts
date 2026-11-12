/**
 * Проверка адреса электронной почты (без обращений в сеть — работает и в браузере, и на сервере):
 *  — строгий синтаксис;
 *  — подсказка при опечатке в известном домене («tandex.ru» → «yandex.ru»).
 * Существует ли сам домен и принимает ли он почту — проверяет сервер (email-dns.ts).
 */

const LOCAL_RE = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/i;
const LABEL_RE = /^[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?$/u;
const TLD_RE = /^(?:xn--[a-z0-9-]{2,59}|\p{L}{2,24})$/iu;

/** Адрес записан по правилам: одна @, нормальное имя и домен с точкой, без двойных точек и пробелов */
export function emailSyntaxOk(email: string): boolean {
  if (email.length > 254) return false;
  const at = email.indexOf("@");
  if (at < 1 || at !== email.lastIndexOf("@")) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || !LOCAL_RE.test(local) || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  if (!labels.every((l) => LABEL_RE.test(l))) return false;
  return TLD_RE.test(labels[labels.length - 1]);
}

/** Популярные почтовые домены, по которым ловим опечатки */
const POPULAR = [
  "yandex.ru", "ya.ru", "yandex.com", "yandex.kz", "yandex.by",
  "mail.ru", "bk.ru", "inbox.ru", "list.ru", "internet.ru", "rambler.ru",
  "gmail.com", "mail.com", "icloud.com", "me.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "proton.me", "protonmail.com",
];

/** Частые ошибки, которые не поймать по расстоянию между буквами */
const KNOWN_WRONG: Record<string, string> = {
  "gmail.ru": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmai.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gnail.com": "gmail.com",
  "yandex.ry": "yandex.ru",
  "yandex.r": "yandex.ru",
  "yandex.rt": "yandex.ru",
  "yandex.ua": "yandex.ru",
  "yanex.ru": "yandex.ru",
  "yadex.ru": "yandex.ru",
  "mail.ry": "mail.ru",
  "mail.r": "mail.ru",
  "mial.ru": "mail.ru",
  "maill.ru": "mail.ru",
};

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

/** Если домен похож на опечатку известного — возвращает исправленный адрес целиком, иначе null */
export function suggestEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain || POPULAR.includes(domain)) return null;
  const known = KNOWN_WRONG[domain];
  if (known) return `${local}@${known}`;
  let best: { d: string; n: number } | null = null;
  for (const d of POPULAR) {
    const n = distance(domain, d);
    // короткие домены (ya.ru, bk.ru) легко «совпасть» случайно — для них допускаем только одну ошибку
    if (n <= (d.length < 8 ? 1 : 2) && (!best || n < best.n)) best = { d, n };
  }
  return best ? `${local}@${best.d}` : null;
}
