import Link from "next/link";
import { SELLER, SITE } from "@/config/site";
import { t } from "@/i18n/dict";
import type { Lang } from "@/i18n/lang";
import { Signature } from "@/components/signature/Signature";
import styles from "./Footer.module.css";

export function Footer({ lang = "ru" }: { lang?: Lang }) {
  const tx = t(lang).footer;
  const en = lang === "en";
  const year = new Date().getFullYear();
  return (
    <footer id="contacts" className={styles.footer} lang={lang}>
      <div className={`container ${styles.top}`}>
        <div className={styles.brand}>
          <p className={styles.wordmark}>
            Kamui <span className="red">×</span> Iosif Abramov
          </p>
          <p className={styles.tagline}>{tx.tagline}</p>
          <div className={styles.sig}>
            <Signature trigger="inview" delay={250} duration={3200} lang={lang} />
          </div>
        </div>

        <div className={styles.requisites}>
          <h2 className={styles.heading}>{tx.requisites}</h2>
          <dl className={styles.list}>
            <div>
              <dt>{tx.seller}</dt>
              <dd>{en ? SELLER.nameEn : SELLER.name}</dd>
            </div>
            <div>
              <dt>{tx.inn}</dt>
              <dd>{SELLER.inn}</dd>
            </div>
            <div>
              <dt>{tx.ogrnip}</dt>
              <dd>{SELLER.ogrnip}</dd>
            </div>
            <div>
              <dt>{tx.legalAddress}</dt>
              <dd>{en ? SELLER.legalAddressEn : SELLER.legalAddress}</dd>
            </div>
            <div>
              <dt>{tx.actualAddress}</dt>
              <dd>{en ? SELLER.actualAddressEn : SELLER.actualAddress}</dd>
            </div>
            {SELLER.phone && (
              <div>
                <dt>{tx.phone}</dt>
                <dd>
                  <a href={`tel:${SELLER.phone.replace(/[^\d+]/g, "")}`}>{SELLER.phone}</a>
                </dd>
              </div>
            )}
            {SELLER.email && (
              <div>
                <dt>{tx.email}</dt>
                <dd>
                  <a href={`mailto:${SELLER.email}`}>{SELLER.email}</a>
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      <div className={`container ${styles.bottom}`}>
        <p>
          © {year} {SITE.name} · {SITE.domain}
        </p>
        <nav className={styles.links} aria-label={tx.docs}>
          {tx.links.map((l) => (
            <Link key={l.href} href={l.href} hrefLang={en ? "ru" : undefined}>
              {l.label}
            </Link>
          ))}
          <a href={en ? "/en#buy" : "/#buy"}>{tx.order}</a>
        </nav>
      </div>
    </footer>
  );
}
