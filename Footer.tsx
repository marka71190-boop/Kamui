import Link from "next/link";
import { SELLER, SITE } from "@/config/site";
import { Signature } from "@/components/signature/Signature";
import styles from "./Footer.module.css";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer id="contacts" className={styles.footer}>
      <div className={`container ${styles.top}`}>
        <div className={styles.brand}>
          <p className={styles.wordmark}>
            Kamui <span className="red">×</span> Iosif Abramov
          </p>
          <p className={styles.tagline}>Limited Edition 0.98 β · 2000 экземпляров · Made in Japan</p>
          <div className={styles.sig}>
            <Signature drawn />
          </div>
        </div>

        <div className={styles.requisites}>
          <h2 className={styles.heading}>Реквизиты продавца</h2>
          <dl className={styles.list}>
            <div>
              <dt>Продавец</dt>
              <dd>{SELLER.name}</dd>
            </div>
            <div>
              <dt>ИНН</dt>
              <dd>{SELLER.inn}</dd>
            </div>
            <div>
              <dt>ОГРНИП</dt>
              <dd>{SELLER.ogrnip}</dd>
            </div>
            <div>
              <dt>Юридический адрес</dt>
              <dd>{SELLER.legalAddress}</dd>
            </div>
            <div>
              <dt>Фактический адрес</dt>
              <dd>{SELLER.actualAddress}</dd>
            </div>
            {SELLER.phone && (
              <div>
                <dt>Телефон</dt>
                <dd>
                  <a href={`tel:${SELLER.phone.replace(/[^\d+]/g, "")}`}>{SELLER.phone}</a>
                </dd>
              </div>
            )}
            {SELLER.email && (
              <div>
                <dt>Email</dt>
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
        <nav className={styles.links} aria-label="Документы">
          <Link href="/privacy">Политика конфиденциальности</Link>
          <Link href="/consent">Согласие на обработку данных</Link>
          <a href="/#buy">Оставить заявку</a>
        </nav>
      </div>
    </footer>
  );
}
