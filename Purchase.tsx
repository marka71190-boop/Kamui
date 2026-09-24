import Image from "next/image";
import { GALLERY } from "@/config/gallery";
import type { Stock } from "@/lib/stock";
import { OrderPanel } from "./OrderPanel";
import styles from "./Purchase.module.css";

export function Purchase({ stock }: { stock: Stock }) {
  const photo = GALLERY[1];
  return (
    <section id="buy" className={`section ${styles.purchase}`} aria-labelledby="buy-title">
      <div className="container">
        <p className="section-label" data-reveal>
          <b>05</b> Покупка
        </p>
        <h2 id="buy-title" className="section-title" data-reveal>
          Закрепите за собой
          <br />
          <span className="red">свой экземпляр</span>
        </h2>

        <div className={styles.layout} data-reveal>
          <div className={styles.visual}>
            <Image
              src={photo.src}
              alt={photo.alt}
              fill
              sizes="(max-width: 960px) 100vw, 42vw"
              placeholder="blur"
              className={styles.visualImg}
            />
            <div className={styles.visualShade} aria-hidden="true" />
            <div className={styles.visualCaption}>
              <span className={styles.badge}>Limited Edition</span>
              <p className={styles.visualModel}>0.98 β</p>
            </div>
          </div>
          <OrderPanel stock={stock} />
        </div>
      </div>
    </section>
  );
}
