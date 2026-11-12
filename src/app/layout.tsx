import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { SITE } from "@/config/site";
import { bebas, montserrat, oswald } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: SITE.seoTitle,
    template: `%s — ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [
    "мел Kamui",
    "мел Камуи",
    "Kamui Абрамов",
    "мел Абрамов",
    "мел Иосиф Абрамов",
    "Иосиф Абрамов",
    "Iosif Abramov",
    "Kamui 0.98",
    "Kamui 0.98 β Pyramid",
    "бильярдный мел",
    "мел для бильярда",
    "мел для русского бильярда",
    "мел для пирамиды",
    "купить мел Kamui",
    "лимитированная серия",
  ],
  category: "Бильярдный мел",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: SITE.locale,
    url: "/",
    siteName: SITE.name,
    title: SITE.seoTitle,
    description: SITE.description,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.seoTitle,
    description: SITE.description,
  },
  // Подтверждение прав в Яндекс.Вебмастере и Google Search Console: код задаётся в панели хостинга
  verification: {
    yandex: process.env.YANDEX_VERIFICATION || undefined,
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#070707",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={`${bebas.variable} ${oswald.variable} ${montserrat.variable}`}>
      <body>{children}</body>
    </html>
  );
}
