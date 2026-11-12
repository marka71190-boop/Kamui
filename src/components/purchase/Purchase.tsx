import { checkoutConfig, type CheckoutConfig } from "@/config/features";
import { GALLERY, galleryFor } from "@/config/gallery";
import { KIT_PHOTO } from "@/config/kit-visual";
import { t } from "@/i18n/dict";
import { RU_MARKET, type Market } from "@/i18n/market";
import type { StockView } from "@/lib/stock";
import { OrderPanel } from "./OrderPanel";
import { PurchaseVisual } from "./PurchaseVisual";
import styles from "./Purchase.module.css";

export function Purchase({
  stock,
  market = RU_MARKET,
  abroad,
}: {
  stock: StockView;
  market?: Market;
  /** Цены для заказов из-за рубежа с оплатой через Robokassa */
  abroad?: CheckoutConfig["abroad"];
}) {
  const lang = market.lang;
  const tx = t(lang).purchase;
  // Фото рядом с формой заказа — мел крупным планом
  const photo = galleryFor(lang).find((p) => p.src === GALLERY[2].src) ?? galleryFor(lang)[0];
  // Английская версия — только заявки из-за рубежа: без СДЭК и онлайн-оплаты ЮKassa
  const checkout: CheckoutConfig =
    lang === "en"
      ? { ...checkoutConfig(), cdek: false, payments: false, paymentsTest: false, cdekCountries: ["RU"], robokassa: false, robokassaTest: false }
      : { ...checkoutConfig(), ...(abroad ? { abroad } : {}) };
  return (
    <section id="buy" className={`section ${styles.purchase}`} aria-labelledby="buy-title">
      <div className="container">
        <p className="section-label" data-reveal>
          <b>07</b> {tx.label}
        </p>
        <h2 id="buy-title" className="section-title" data-reveal>
          {tx.title}
        </h2>

        <div className={styles.layout} data-reveal>
          <PurchaseVisual
            chalk={{ src: photo.src, alt: photo.alt }}
            kit={{ src: KIT_PHOTO, alt: t(lang).kit.photoAlt }}
            kitBadge={t(lang).kit.label}
          />
          <OrderPanel stock={stock} checkout={checkout} market={market} />
        </div>
      </div>
    </section>
  );
}
