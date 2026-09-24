import { GALLERY } from "@/config/gallery";
import { PRODUCT, SELLER, SITE } from "@/config/site";
import type { Stock } from "./stock";

/** Разметка schema.org Product — для расширенных сниппетов в Яндексе и Google. */
export function productJsonLd(stock: Stock) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: PRODUCT.name,
    sku: PRODUCT.sku,
    description: SITE.description,
    brand: { "@type": "Brand", name: PRODUCT.brand },
    image: GALLERY.map((p) => new URL(p.src.src, SITE.url).toString()),
    offers: {
      "@type": "Offer",
      url: `${SITE.url}/#buy`,
      price: PRODUCT.price,
      priceCurrency: PRODUCT.currency,
      availability: stock.soldOut ? "https://schema.org/SoldOut" : "https://schema.org/LimitedAvailability",
      inventoryLevel: { "@type": "QuantitativeValue", value: stock.remaining },
      seller: { "@type": "Organization", name: SELLER.name },
    },
  };
}
