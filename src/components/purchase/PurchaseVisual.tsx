"use client";

/**
 * Фото рядом с формой заказа: мел или подарочный набор — смотря что выбрано в форме
 * (форма сообщает о выборе событием PRODUCT_EVENT).
 */
import { useEffect, useState } from "react";
import Image, { type StaticImageData } from "next/image";
import type { ProductId } from "@/config/products";
import styles from "./Purchase.module.css";

export const PRODUCT_EVENT = "kamui:product";

export function PurchaseVisual({
  chalk,
  kit,
  kitBadge,
}: {
  chalk: { src: StaticImageData; alt: string };
  kit: { src: StaticImageData; alt: string };
  kitBadge: string;
}) {
  const [product, setProduct] = useState<ProductId>("chalk");
  useEffect(() => {
    const on = (e: Event) => setProduct((e as CustomEvent<ProductId>).detail === "kit" ? "kit" : "chalk");
    window.addEventListener(PRODUCT_EVENT, on);
    return () => window.removeEventListener(PRODUCT_EVENT, on);
  }, []);
  const isKit = product === "kit";
  return (
    <div className={styles.visual}>
      <Image
        src={chalk.src}
        alt={chalk.alt}
        fill
        sizes="(max-width: 960px) 100vw, 42vw"
        placeholder="blur"
        className={styles.visualImg}
        style={{ opacity: isKit ? 0 : 1 }}
        aria-hidden={isKit || undefined}
      />
      <Image
        src={kit.src}
        alt={kit.alt}
        fill
        sizes="(max-width: 960px) 100vw, 42vw"
        className={`${styles.visualImg} ${styles.visualKit}`}
        style={{ opacity: isKit ? 1 : 0 }}
        aria-hidden={!isKit || undefined}
      />
      <div className={styles.visualShade} aria-hidden="true" />
      <div className={styles.visualCaption}>
        <span className={styles.badge}>{isKit ? kitBadge : "Limited Edition"}</span>
        {!isKit && <p className={styles.visualModel}>0.98 β</p>}
      </div>
    </div>
  );
}
