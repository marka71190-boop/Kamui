"use client";

import { useEffect, useState } from "react";
import { t } from "@/i18n/dict";
import { RU_MARKET, type Market } from "@/i18n/market";
import { formatMoney, formatNumber } from "@/lib/format";
import type { StockView } from "@/lib/stock";
import { useLiveStock } from "@/components/stock/LiveStock";
import { ArrowRight } from "@/components/ui/Icons";
import styles from "./MobileBuyBar.module.css";

/**
 * Кнопка «Купить» внизу экрана на телефоне: появляется после первого экрана и прячется,
 * когда виден сам блок покупки или подвал (чтобы ничего не закрывать).
 */
export function MobileBuyBar({ stock: initial, market = RU_MARKET }: { stock: StockView; market?: Market }) {
  const stock = useLiveStock(initial);
  const lang = market.lang;
  const tx = t(lang).header;
  const [scrolled, setScrolled] = useState(false);
  const [covered, setCovered] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const targets = [document.getElementById("buy"), document.getElementById("contacts")].filter((el): el is HTMLElement => Boolean(el));
    const visible = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target);
          else visible.delete(e.target);
        }
        setCovered(visible.size > 0);
      },
      { rootMargin: "0px 0px -80px 0px" },
    );
    targets.forEach((el) => io.observe(el));
    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
    };
  }, []);

  if (stock.soldOut) return null;
  const show = scrolled && !covered;
  return (
    <div className={styles.bar} data-show={show || undefined} aria-hidden={!show} inert={!show}>
      <p className={styles.info}>
        <b>{formatMoney(market.unitPrice, market.currency)}</b>
        <span>
          {tx.left} {formatNumber(stock.remaining, lang)}
        </span>
      </p>
      <a href={`${lang === "en" ? "/en" : "/"}#buy`} className={`btn ${styles.cta}`}>
        {tx.buy}
        <ArrowRight className="btn__arrow" />
      </a>
    </div>
  );
}
