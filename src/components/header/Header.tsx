"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { t } from "@/i18n/dict";
import { RU_MARKET, type Market } from "@/i18n/market";
import { formatMoney, formatNumber } from "@/lib/format";
import type { StockView } from "@/lib/stock";
import { useLiveStock } from "@/components/stock/LiveStock";
import styles from "./Header.module.css";

export function Header({ stock: initialStock, market = RU_MARKET }: { stock?: StockView; market?: Market }) {
  const stock = useLiveStock(initialStock);
  const lang = market.lang;
  const tx = t(lang).header;
  const home = lang === "en" ? "/en" : "/";
  const NAV = tx.nav.map((item) => ({ href: `${home}#${item.hash}`, label: item.label }));
  const buyHref = `${home}#buy`;
  const otherLang = lang === "en" ? { href: "/", hreflang: "ru" } : { href: "/en", hreflang: "en" };
  const remaining = stock?.remaining;
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <header className={styles.header} data-scrolled={scrolled || undefined} data-open={open || undefined}>
        <a href="#main" className={styles.skip}>
          {tx.skip}
        </a>
        <div className={`container ${styles.inner}`}>
          <Link href={home} className={styles.logo} aria-label={tx.home} onClick={close}>
            <span className={styles.logoMain}>Kamui</span>
            <span className={styles.logoX} aria-hidden="true">
              ×
            </span>
            <span className={styles.logoMain}>Abramov</span>
            <span className={styles.logoTag}>0.98 β</span>
          </Link>

          <nav className={styles.nav} aria-label={tx.mainNav}>
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className={styles.navLink}>
                {item.label}
              </a>
            ))}
          </nav>

          <div className={styles.actions}>
            {typeof remaining === "number" && remaining > 0 && (
              <span className={styles.stock}>
                {tx.left} <b>{formatNumber(remaining, lang)}</b>
              </span>
            )}
            <a
              href={otherLang.href}
              hrefLang={otherLang.hreflang}
              className={styles.lang}
              aria-label={tx.switchLabel}
              title={tx.switchLabel}
            >
              {tx.switchShort}
            </a>
            <a href={buyHref} className={`btn ${styles.cta}`} onClick={close}>
              {tx.buy} <span className={styles.ctaPrice}>{formatMoney(market.unitPrice, market.currency)}</span>
            </a>
            <button
              type="button"
              className={styles.burger}
              aria-label={open ? tx.closeMenu : tx.openMenu}
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen((v) => !v)}
            >
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      {/* Меню вынесено из <header>: backdrop-filter шапки иначе «запирает» position: fixed */}
      <div
        id="mobile-menu"
        className={styles.mobileMenu}
        data-open={open || undefined}
        aria-hidden={!open}
        inert={!open}
      >
        <nav className={styles.mobileNav} aria-label={tx.mobileNav}>
          {NAV.map((item, i) => (
            <a key={item.href} href={item.href} onClick={close} style={{ transitionDelay: `${80 + i * 50}ms` }}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              {item.label}
            </a>
          ))}
          <a href={buyHref} onClick={close} style={{ transitionDelay: "300ms" }}>
            <span>05</span>
            {tx.buy}
          </a>
          <a href={otherLang.href} hrefLang={otherLang.hreflang} onClick={close} style={{ transitionDelay: "350ms" }}>
            <span>{tx.switchShort}</span>
            {tx.switchLabel}
          </a>
        </nav>
        {stock && (
          <p className={styles.mobileStock}>
            {tx.mobileStock(stock.remaining, stock.total)}
          </p>
        )}
      </div>
    </>
  );
}
