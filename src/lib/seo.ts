import { cdekCountry } from "@/config/cdek-countries";
import { GALLERY } from "@/config/gallery";
import { PRODUCT, SELLER, SITE } from "@/config/site";
import type { StockView } from "./stock";

/**
 * Разметка schema.org для Яндекса и Google: товар, магазин, сайт и вопросы-ответы.
 * Помогает поисковикам понять, что это за мел, и показать цену и наличие в выдаче.
 */

type Offer = { price: number; currency: "RUB" | "USD"; url: string; description?: string };

/** Другие написания названия — как люди ищут мел */
const ALTERNATE_NAMES = [
  "Мел Kamui × Иосиф Абрамов 0.98 β",
  "Мел Камуи Иосиф Абрамов",
  "Мел Kamui Абрамов",
  "Бильярдный мел Абрамова",
  "Kamui 0.98 β Pyramid Iosif Abramov",
  "Kamui Abramov chalk",
];

const ORG_ID = `${SITE.url}/#store`;

export function productJsonLd(
  stock: StockView,
  offer: Offer = { price: PRODUCT.price, currency: "RUB", url: `${SITE.url}/#buy` },
) {
  const ru = offer.currency === "RUB";
  return {
    "@type": "Product",
    "@id": `${SITE.url}/#product`,
    name: PRODUCT.name,
    alternateName: ALTERNATE_NAMES,
    sku: PRODUCT.sku,
    mpn: PRODUCT.sku,
    category: ru ? "Бильярдный мел" : "Billiard chalk",
    description: offer.description ?? SITE.description,
    brand: { "@type": "Brand", name: PRODUCT.brand },
    image: GALLERY.map((p) => new URL(p.src.src, SITE.url).toString()),
    additionalProperty: [
      { "@type": "PropertyValue", name: ru ? "Модель" : "Model", value: "0.98 β Pyramid" },
      { "@type": "PropertyValue", name: ru ? "Тираж" : "Edition size", value: stock.total },
      { "@type": "PropertyValue", name: ru ? "Производство" : "Made in", value: ru ? "Япония" : "Japan" },
    ],
    offers: {
      "@type": "Offer",
      url: offer.url,
      price: offer.price,
      priceCurrency: offer.currency,
      itemCondition: "https://schema.org/NewCondition",
      availability: stock.soldOut ? "https://schema.org/SoldOut" : "https://schema.org/LimitedAvailability",
      inventoryLevel: { "@type": "QuantitativeValue", value: stock.remaining },
      seller: { "@id": ORG_ID },
      ...(ru
        ? {
            // Условия со страницы «Обмен и возврат»: 7 дней после получения
            hasMerchantReturnPolicy: {
              "@type": "MerchantReturnPolicy",
              applicableCountry: "RU",
              returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
              merchantReturnDays: 7,
              returnMethod: "https://schema.org/ReturnByMail",
              returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
            },
          }
        : {}),
    },
  };
}

/** Магазин (продавец). countries — куда доставляем СДЭК с оплатой на сайте. */
export function storeJsonLd(countries: readonly string[] = ["RU"]) {
  return {
    "@type": "OnlineStore",
    "@id": ORG_ID,
    name: SITE.name,
    url: SITE.url,
    logo: `${SITE.url}/apple-icon.png`,
    email: SELLER.email || undefined,
    legalName: SELLER.name,
    taxID: SELLER.inn,
    // Куда доставляем СДЭК с оплатой на сайте
    areaServed: countries.map((c) => ({ "@type": "Country", name: cdekCountry(c).name })),
    address: {
      "@type": "PostalAddress",
      addressCountry: "RU",
      addressLocality: "Краснодар",
      postalCode: "350051",
      streetAddress: "улица Шоссе Нефтяников, 40",
    },
  };
}

/** Сайт */
export function websiteJsonLd(lang: "ru" | "en") {
  return {
    "@type": "WebSite",
    "@id": `${SITE.url}/#website`,
    name: SITE.name,
    alternateName: lang === "ru" ? "Мел Kamui × Иосиф Абрамов" : "Kamui × Iosif Abramov chalk",
    url: SITE.url,
    inLanguage: lang === "ru" ? "ru-RU" : "en",
    publisher: { "@id": ORG_ID },
  };
}

/** Вопросы и ответы — тот же текст, что в блоке «Вопросы и ответы» на странице */
export function faqJsonLd(items: { q: string; a: string }[]) {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    })),
  };
}

/** Всё вместе одним блоком <script type="application/ld+json"> */
export function pageJsonLd(parts: object[]): string {
  return JSON.stringify({ "@context": "https://schema.org", "@graph": parts }).replace(/</g, "\\u003c");
}
