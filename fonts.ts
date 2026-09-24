import localFont from "next/font/local";

/**
 * Шрифты хранятся в проекте (src/app/fonts) — без запросов к Google Fonts:
 * быстрее первый экран и никаких внешних сервисов (важно для 152-ФЗ).
 *
 * Bebas Neue — заголовки (латиница). Во все три файла добавлен знак β (и для заглавных букв).
 * Oswald      — кириллица в заголовках (у Bebas Neue её нет), подставляется автоматически.
 * Montserrat  — основной текст.
 */

export const bebas = localFont({
  src: "./fonts/BebasNeue-Regular.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  variable: "--font-bebas",
});

export const oswald = localFont({
  src: "./fonts/Oswald-Variable.woff2",
  weight: "200 700",
  style: "normal",
  display: "swap",
  variable: "--font-oswald",
  preload: false,
});

export const montserrat = localFont({
  src: "./fonts/Montserrat-Variable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-montserrat",
});
