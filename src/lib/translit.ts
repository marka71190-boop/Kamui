/**
 * Кириллица → латиница по правилам загранпаспорта РФ (ICAO Doc 9303):
 * Щукин → Shchukin, Юлия → Iuliia, Хабибуллина → Khabibullina.
 * Латиница, цифры и знаки препинания остаются как есть.
 */
const MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "ie", ы: "y", ь: "", э: "e", ю: "iu", я: "ia",
  // украинские и белорусские буквы
  і: "i", ї: "i", є: "ie", ґ: "g", ў: "u",
};

const isUpper = (ch: string) => ch !== ch.toLowerCase() && ch === ch.toUpperCase();

export function hasCyrillic(s: string): boolean {
  return /[Ѐ-ӿ]/.test(s);
}

export function toLatin(input: string): string {
  const chars = Array.from(input);
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const lower = ch.toLowerCase();
    const lat = MAP[lower];
    if (lat === undefined) {
      out += ch;
      continue;
    }
    if (!lat || !isUpper(ch)) {
      out += lat;
      continue;
    }
    // Заглавная буква: «Щ» в «Щукин» → «Shch», в «ЩУКИН» → «SHCH»
    const next = chars[i + 1] ?? "";
    const prev = chars[i - 1] ?? "";
    const wordIsCaps = (next && isUpper(next)) || (!next.trim() && prev && isUpper(prev));
    out += wordIsCaps ? lat.toUpperCase() : lat[0].toUpperCase() + lat.slice(1);
  }
  return out;
}
