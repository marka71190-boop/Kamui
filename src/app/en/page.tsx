import type { Metadata } from "next";
import { HomePage } from "@/components/HomePage";
import { HtmlLang } from "@/components/i18n/HtmlLang";
import { SITE } from "@/config/site";
import { enMarket } from "@/i18n/market";
import { getUsdPrice } from "@/lib/currency";
import { t } from "@/i18n/dict";
import { formatMoney } from "@/lib/format";
import { faqJsonLd, pageJsonLd, productJsonLd, storeJsonLd, websiteJsonLd } from "@/lib/seo";
import { renderPerRequestOnOwnServer } from "@/lib/render-mode";
import { getStock } from "@/lib/stock";

/** Английская версия: цена в долларах (PRODUCT.priceUsd или PRICE_USD), остаток — раз в минуту. */
export const revalidate = 60;

const TITLE = "Kamui × Iosif Abramov — Limited Edition 0.98 β";
const DESCRIPTION =
  "Limited-edition Kamui × Iosif Abramov 0.98 β billiard chalk. Only 2,000 pieces: Kamui’s Japanese technology and the experience of one of the strongest players in modern billiards. Worldwide shipping.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} — collectible billiard chalk` },
  description: DESCRIPTION,
  alternates: { canonical: "/en", languages: { ru: "/", en: "/en" } },
  openGraph: { type: "website", locale: "en_US", url: "/en", siteName: SITE.name, title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default async function EnglishPage() {
  await renderPerRequestOnOwnServer();
  const [stock, usd] = await Promise.all([getStock(), getUsdPrice()]);
  const market = enMarket(usd.unit, usd.kit, usd.wholesale);
  const jsonLd = pageJsonLd([
    productJsonLd(stock, { price: usd.unit, currency: "USD", url: `${SITE.url}/en#buy`, description: DESCRIPTION }),
    storeJsonLd(),
    websiteJsonLd("en"),
    faqJsonLd(
      t("en").faq.items(formatMoney(usd.unit, "USD"), undefined, false, "", formatMoney(usd.kit, "USD"), formatMoney(usd.wholesale, "USD")),
    ),
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <HtmlLang lang="en" />
      <HomePage stock={stock} market={market} />
    </>
  );
}
