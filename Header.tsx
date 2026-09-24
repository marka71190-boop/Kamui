"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatNumber, formatPrice } from "@/lib/format";
import { PRODUCT } from "@/config/site";
import type { Stock } from "@/lib/stock";
import styles from "./Header.module.css";

const NAV = [
  { href: "/#collection", label: "Коллекция" },
  { href: "/#features", label: "Преимущества" },
  { href: "/#story", label: "История" },
  { href: "/#gallery", label: "Галерея" },
];

export function Header({ stock }: { stock?: Stock }) {
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
          Перейти к содержимому
        </a>
        <div className={`container ${styles.inner}`}>
          <Link href="/" className={styles.logo} aria-label="Kamui × Iosif Abramov — на главную" onClick={close}>
            <span className={styles.logoMain}>Kamui</span>
            <span className={styles.logoX} aria-hidden="true">
              ×
            </span>
            <span className={styles.logoMain}>Abramov</span>
            <span className={styles.logoTag}>0.98 β</span>
          </Link>

          <nav className={styles.nav} aria-label="Основное меню">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className={styles.navLink}>
                {item.label}
              </a>
            ))}
          </nav>

          <div className={styles.actions}>
            {typeof remaining === "number" && remaining > 0 && (
              <span className={styles.stock}>
                Осталось <b>{formatNumber(remaining)}</b>
              </span>
            )}
            <a href="/#buy" className={`btn ${styles.cta}`} onClick={close}>
              Купить <span className={styles.ctaPrice}>{formatPrice(PRODUCT.price)}</span>
            </a>
            <button
              type="button"
              className={styles.burger}
              aria-label={open ? "Закрыть меню" : "Открыть меню"}
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
        <nav className={styles.mobileNav} aria-label="Мобильное меню">
          {NAV.map((item, i) => (
            <a key={item.href} href={item.href} onClick={close} style={{ transitionDelay: `${80 + i * 50}ms` }}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              {item.label}
            </a>
          ))}
          <a href="/#buy" onClick={close} style={{ transitionDelay: "300ms" }}>
            <span>05</span>
            Купить
          </a>
        </nav>
        {stock && (
          <p className={styles.mobileStock}>
            Лимитированная серия · осталось {formatNumber(stock.remaining)} из {formatNumber(stock.total)}
          </p>
        )}
      </div>
    </>
  );
}
