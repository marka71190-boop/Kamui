import Link from "next/link";
import type { ReactNode } from "react";
import { Footer } from "@/components/footer/Footer";
import { Header } from "@/components/header/Header";
import styles from "@/app/privacy/privacy.module.css";

/** Общий макет юридических страниц: оферта, доставка и оплата, возврат. */
export function LegalPage({ title, edition, children }: { title: string; edition?: string; children: ReactNode }) {
  return (
    <>
      <Header />
      <main id="main" className={styles.page}>
        <div className={`container ${styles.inner}`}>
          <Link href="/" className={styles.back}>
            ← На главную
          </Link>
          <h1 className={styles.title}>{title}</h1>
          {edition && <p className={styles.meta}>Редакция от {edition}</p>}
          <article className={styles.doc}>{children}</article>
        </div>
      </main>
      <Footer />
    </>
  );
}
