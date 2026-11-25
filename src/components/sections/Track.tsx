import { OrderLookup } from "@/components/order/OrderLookup";
import { SELLER, telegramUrl } from "@/config/site";
import type { Lang } from "@/i18n/lang";
import styles from "./Track.module.css";

/** «Где мой заказ» на главной: статус и трек-номер СДЭК по номеру заказа или телефону */
export function Track({ lang = "ru" }: { lang?: Lang }) {
  const en = lang === "en";
  return (
    <section id="track" className={`section ${styles.track}`} aria-labelledby="track-title">
      <div className={`container ${styles.grid}`}>
        <div>
          <p className="section-label" data-reveal>
            <b>09</b> {en ? "Delivery" : "Доставка"}
          </p>
          <h2 id="track-title" className={`section-title ${styles.title}`} data-reveal>
            {en ? "Track your order" : "Где мой заказ"}
          </h2>
          <p className={styles.lead} data-reveal>
            {en
              ? "Order status and the CDEK tracking number — by order number or phone."
              : "Статус заказа и трек-номер СДЭК — по номеру заказа или телефону."}
          </p>
        </div>
        <div data-reveal>
          <OrderLookup
            lang={lang}
            telegram={SELLER.telegram ? { name: SELLER.telegram, url: telegramUrl() } : undefined}
            email={SELLER.email}
          />
        </div>
      </div>
    </section>
  );
}
