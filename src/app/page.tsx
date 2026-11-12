import type { Metadata } from "next";
import { deliveryCountries, HomePage, robokassaPublic } from "@/components/HomePage";
import { features } from "@/config/features";
import { KIT, WHOLESALE } from "@/config/products";
import { PRODUCT } from "@/config/site";
import { t } from "@/i18n/dict";
import { formatMoney } from "@/lib/format";
import { faqJsonLd, pageJsonLd, productJsonLd, storeJsonLd, websiteJsonLd } from "@/lib/seo";
import { renderPerRequestOnOwnServer } from "@/lib/render-mode";
import { getAbroadPricing } from "@/lib/currency";
import { getStock } from "@/lib/stock";

/** Страница статическая и пересобирается раз в минуту — так остаток всегда свежий. */
export const revalidate = 60;

export const metadata: Metadata = {
  alternates: { canonical: "/", languages: { ru: "/", en: "/en" } },
};

export default async function Page() {
  await renderPerRequestOnOwnServer();
  // Цены для заказов из-за рубежа (Беларусь, Казахстан, Армения, Кыргызстан с оплатой через Robokassa)
  const [stock, abroad] = await Promise.all([
    getStock(),
    features.robokassa && features.cdek ? getAbroadPricing() : Promise.resolve(undefined),
  ]);
  const jsonLd = pageJsonLd([
    productJsonLd(stock),
    storeJsonLd(deliveryCountries()),
    websiteJsonLd("ru"),
    faqJsonLd(
      t("ru").faq.items(
        formatMoney(PRODUCT.price, "RUB"),
        deliveryCountries(),
        robokassaPublic(),
        abroad ? formatMoney(abroad.unitUsd, "USD") : "",
        formatMoney(KIT.price, "RUB"),
        formatMoney(WHOLESALE.price, "RUB"),
        abroad ? formatMoney(abroad.wholesaleUsd, "USD") : "",
      ),
    ),
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <HomePage stock={stock} abroad={abroad && { unitUsd: abroad.unitUsd, kitUsd: abroad.kitUsd, wholesaleUsd: abroad.wholesaleUsd, rate: abroad.rate }} />
    </>
  );
}
