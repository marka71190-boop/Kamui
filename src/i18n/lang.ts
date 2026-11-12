/** Языки сайта: русская версия — «/», английская — «/en». */
export type Lang = "ru" | "en";

export const isLang = (v: unknown): v is Lang => v === "ru" || v === "en";
