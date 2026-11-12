import { features } from "@/config/features";
import { RU_MARKET, type Market } from "@/i18n/market";
import { formatMoney } from "@/lib/format";
import type { StockView } from "@/lib/stock";
import { LiveStockProvider } from "./stock/LiveStock";
import { Footer } from "./footer/Footer";
import { Header } from "./header/Header";
import { Hero } from "./hero/Hero";
import { MobileBuyBar } from "./purchase/MobileBuyBar";
import { Purchase } from "./purchase/Purchase";
import { Collection } from "./sections/Collection";
import { Faq } from "./sections/Faq";
import { Features } from "./sections/Features";
import { Gallery } from "./sections/Gallery";
import { Kit } from "./sections/Kit";
import { Official } from "./sections/Official";
import { Story } from "./sections/Story";
import { Marquee } from "./ui/Marquee";
import { RevealObserver } from "./ui/RevealObserver";

/** Страны доставки СДЭК, включённые на сайте (для текстов «Вопросы и ответы») */
export const deliveryCountries = () => features.publicCdekCountries;
/** Упоминать ли Robokassa в текстах (в тестовом режиме — нет) */
export const robokassaPublic = () => features.robokassa && !features.robokassaTest;

export function HomePage({
  stock: full,
  market = RU_MARKET,
  abroad,
}: {
  stock: StockView;
  market?: Market;
  /** Цены для заказов из-за рубежа (оплата через Robokassa): мел в $ и курс ЦБ */
  abroad?: { unitUsd: number; kitUsd: number; wholesaleUsd: number; rate: number };
}) {
  const lang = market.lang;
  // В браузер — только цифры для показа
  const stock: StockView = { total: full.total, sold: full.sold, remaining: full.remaining, soldOut: full.soldOut };
  return (
    <LiveStockProvider initial={stock}>
      <Header stock={stock} market={market} />
      <main id="main" lang={lang}>
        <Hero stock={stock} market={market} />
        <Marquee />
        <Collection stock={stock} lang={lang} />
        <Features lang={lang} />
        <Story lang={lang} />
        <Gallery lang={lang} />
        <Official lang={lang} />
        <Kit market={market} />
        <Purchase stock={stock} market={market} abroad={abroad} />
        <Faq
          lang={lang}
          price={formatMoney(market.unitPrice, market.currency)}
          countries={deliveryCountries()}
          robokassa={robokassaPublic()}
          abroadPrice={abroad ? formatMoney(abroad.unitUsd, "USD") : undefined}
          kitPrice={formatMoney(market.kitPrice, market.currency)}
          wholesalePrice={formatMoney(market.wholesalePrice, market.currency)}
          abroadWholesale={abroad ? formatMoney(abroad.wholesaleUsd, "USD") : undefined}
        />
      </main>
      <Footer lang={lang} />
      <MobileBuyBar stock={stock} market={market} />
      <RevealObserver />
    </LiveStockProvider>
  );
}
