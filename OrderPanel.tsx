"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { PRODUCT } from "@/config/site";
import { formatPrice } from "@/lib/format";
import {
  formatRuPhoneInput,
  LIMITS,
  normalizeOrderInput,
  validateOrderInput,
  type FieldErrors,
  type OrderField,
  type OrderInput,
} from "@/lib/orders/validation";
import type { Stock } from "@/lib/stock";
import { ArrowRight, Check } from "@/components/ui/Icons";
import { StockMeter } from "@/components/ui/StockMeter";
import { QuantityStepper } from "./QuantityStepper";
import styles from "./Purchase.module.css";

type Stage = "intro" | "form" | "success";

type Fields = Omit<OrderInput, "quantity" | "region">;

const EMPTY: Fields = {
  name: "",
  phone: "",
  email: "",
  city: "",
  comment: "",
  country: "",
  postalCode: "",
  address: "",
  consent: false,
  company: "",
};

/** Порядок полей — для фокуса на первой ошибке */
const FIELD_ORDER: OrderField[] = [
  "quantity",
  "name",
  "phone",
  "email",
  "country",
  "city",
  "postalCode",
  "address",
  "comment",
  "consent",
];

const SUCCESS_TEXT = "Спасибо! Ваша заявка принята. Мы свяжемся с вами для уточнения доставки и оплаты.";

export function OrderPanel({ stock }: { stock: Stock }) {
  const maxQuantity = Math.max(0, Math.min(PRODUCT.maxPerOrder, stock.remaining));
  const soldOut = maxQuantity === 0;

  const [stage, setStage] = useState<Stage>("intro");
  const [quantity, setQuantity] = useState(1);
  const [region, setRegion] = useState<OrderInput["region"]>("ru");
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [orderId, setOrderId] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Возврат со страницы оплаты ЮKassa: /?order=KA-...#buy
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("order");
    if (id && /^KA-\d{6}-[A-Z0-9]{4}$/.test(id)) {
      setOrderId(id);
      setStage("success");
    }
  }, []);

  const input = (): OrderInput => normalizeOrderInput({ ...fields, quantity, region });

  const revalidate = (next: Partial<Fields> = {}, nextRegion = region, nextQty = quantity) => {
    if (!submitted) return;
    setErrors(
      validateOrderInput(normalizeOrderInput({ ...fields, ...next, region: nextRegion, quantity: nextQty }), {
        maxQuantity,
      }),
    );
  };

  const set =
    <K extends keyof Fields>(key: K) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      let value: Fields[K];
      if (key === "consent") value = (e.target as HTMLInputElement).checked as Fields[K];
      else if (key === "phone" && region === "ru") value = formatRuPhoneInput(e.target.value) as Fields[K];
      else value = e.target.value as Fields[K];
      setFields((f) => ({ ...f, [key]: value }));
      revalidate({ [key]: value } as Partial<Fields>);
    };

  const changeQuantity = (q: number) => {
    setQuantity(q);
    revalidate({}, region, q);
  };

  const toggleRegion = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.checked ? "intl" : "ru";
    setRegion(next);
    revalidate({}, next);
  };

  const openForm = () => {
    setStage("form");
    window.setTimeout(() => firstFieldRef.current?.focus({ preventScroll: true }), 450);
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (stage !== "form" || submitting) return;
    setSubmitted(true);
    setServerError("");

    const data = input();
    const errs = validateOrderInput(data, { maxQuantity });
    setErrors(errs);
    const firstInvalid = FIELD_ORDER.find((f) => errs[f]);
    if (firstInvalid) {
      rootRef.current?.querySelector<HTMLElement>(`[data-field="${firstInvalid}"]`)?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        orderId?: string;
        paymentUrl?: string;
        error?: string;
        fieldErrors?: FieldErrors;
      };
      if (res.ok && body.ok && body.orderId) {
        if (body.paymentUrl) {
          window.location.assign(body.paymentUrl);
          return;
        }
        setOrderId(body.orderId);
        setStage("success");
        setFields(EMPTY);
        setSubmitted(false);
        rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        if (body.fieldErrors) setErrors(body.fieldErrors);
        setServerError(body.error || "Не удалось отправить заявку. Попробуйте ещё раз.");
      }
    } catch {
      setServerError("Нет соединения. Проверьте интернет и попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  };

  const total = PRODUCT.price * quantity;
  const formOpen = stage === "form";

  if (stage === "success") {
    return (
      <div ref={rootRef} className={styles.success} role="status" aria-live="polite">
        <span className={styles.successIcon} aria-hidden="true">
          <Check />
        </span>
        <p className={styles.successTitle}>Заявка отправлена</p>
        <p className={styles.successText}>{SUCCESS_TEXT}</p>
        {orderId && (
          <p className={styles.orderId}>
            Номер заявки <b>{orderId}</b>
          </p>
        )}
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            setStage("intro");
            setOrderId("");
            if (window.location.search) window.history.replaceState(null, "", window.location.pathname + "#buy");
          }}
        >
          Оформить ещё одну заявку
        </button>
      </div>
    );
  }

  const err = (f: OrderField) => errors[f];
  const a11y = (f: OrderField) => ({
    "data-field": f,
    "aria-invalid": err(f) ? true : undefined,
    "aria-describedby": err(f) ? `${f}-error` : undefined,
  });

  return (
    <div ref={rootRef} className={styles.panel}>
      <form onSubmit={onSubmit} noValidate aria-label="Заявка на покупку">
        <div className={styles.summary}>
          <div>
            <p className={styles.productName}>Kamui × Iosif Abramov</p>
            <p className={styles.productSub}>Limited Edition 0.98 β</p>
          </div>
          <p className={styles.bigPrice}>
            {formatPrice(PRODUCT.price)}
            <span>за 1 шт.</span>
          </p>
        </div>

        <StockMeter stock={stock} compact className={styles.stock} />

        <div className={styles.qtyRow}>
          <span id="qty-label" className={styles.qtyLabel}>
            Количество
          </span>
          <QuantityStepper
            value={quantity}
            max={Math.max(1, maxQuantity)}
            onChange={changeQuantity}
            labelledBy="qty-label"
            disabled={soldOut}
          />
          <p className={styles.total}>
            <span>Итого</span>
            <b>{formatPrice(total)}</b>
          </p>
        </div>
        {err("quantity") && (
          <p id="quantity-error" className={styles.error} role="alert">
            {err("quantity")}
          </p>
        )}

        {!formOpen && (
          <div className={styles.introCta}>
            <button
              type="button"
              className="btn btn--block"
              onClick={openForm}
              disabled={soldOut}
              aria-controls="order-fields"
              aria-expanded={false}
            >
              {soldOut ? "Тираж распродан" : "Оставить заявку"}
              {!soldOut && <ArrowRight className="btn__arrow" />}
            </button>
            <p className={styles.note}>
              Без предоплаты: после заявки мы свяжемся с вами, чтобы уточнить доставку и оплату.
            </p>
          </div>
        )}

        <div id="order-fields" className={styles.collapse} data-open={formOpen || undefined}>
          <div className={styles.collapseInner} inert={!formOpen}>
            <div className={styles.fields}>
              <label className={styles.switch}>
                <input type="checkbox" role="switch" checked={region === "intl"} onChange={toggleRegion} />
                <span className={styles.switchTrack} aria-hidden="true" />
                <span>Я нахожусь вне России</span>
              </label>

              <Field id="name" label="Имя" error={err("name")} required>
                <input
                  ref={firstFieldRef}
                  id="name"
                  name="name"
                  autoComplete="name"
                  maxLength={LIMITS.name}
                  value={fields.name}
                  onChange={set("name")}
                  placeholder="Как к вам обращаться"
                  {...a11y("name")}
                />
              </Field>

              <Field id="phone" label="Телефон" error={err("phone")} required>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={LIMITS.phone}
                  value={fields.phone}
                  onChange={set("phone")}
                  placeholder={region === "ru" ? "+7 (999) 123-45-67" : "+49 30 1234567"}
                  {...a11y("phone")}
                />
              </Field>

              <Field id="email" label="Email" error={err("email")} required>
                <input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  maxLength={LIMITS.email}
                  value={fields.email}
                  onChange={set("email")}
                  placeholder="you@example.com"
                  {...a11y("email")}
                />
              </Field>

              {region === "intl" && (
                <Field id="country" label="Страна" error={err("country")} required>
                  <input
                    id="country"
                    name="country"
                    autoComplete="country-name"
                    maxLength={LIMITS.country}
                    value={fields.country}
                    onChange={set("country")}
                    placeholder="Например, Казахстан"
                    {...a11y("country")}
                  />
                </Field>
              )}

              <Field id="city" label="Город" error={err("city")} required>
                <input
                  id="city"
                  name="city"
                  autoComplete="address-level2"
                  maxLength={LIMITS.city}
                  value={fields.city}
                  onChange={set("city")}
                  placeholder={region === "ru" ? "Например, Краснодар" : "Город"}
                  {...a11y("city")}
                />
              </Field>

              {region === "intl" && (
                <>
                  <Field id="postalCode" label="Индекс" error={err("postalCode")} required>
                    <input
                      id="postalCode"
                      name="postalCode"
                      autoComplete="postal-code"
                      maxLength={LIMITS.postalCode}
                      value={fields.postalCode}
                      onChange={set("postalCode")}
                      placeholder="Почтовый индекс"
                      {...a11y("postalCode")}
                    />
                  </Field>
                  <Field id="address" label="Адрес" error={err("address")} required wide>
                    <input
                      id="address"
                      name="address"
                      autoComplete="street-address"
                      maxLength={LIMITS.address}
                      value={fields.address}
                      onChange={set("address")}
                      placeholder="Улица, дом, квартира"
                      {...a11y("address")}
                    />
                  </Field>
                </>
              )}

              <Field id="comment" label="Комментарий" error={err("comment")} wide>
                <textarea
                  id="comment"
                  name="comment"
                  rows={3}
                  maxLength={LIMITS.comment}
                  value={fields.comment}
                  onChange={set("comment")}
                  placeholder={
                    region === "ru"
                      ? "Удобное время для звонка, пожелания по доставке"
                      : "Предпочтительная служба доставки, удобный мессенджер"
                  }
                  {...a11y("comment")}
                />
              </Field>

              {/* Ловушка для ботов: скрыта от людей */}
              <div className={styles.hp} aria-hidden="true">
                <label htmlFor="company">Компания</label>
                <input
                  id="company"
                  name="company"
                  tabIndex={-1}
                  autoComplete="off"
                  value={fields.company}
                  onChange={set("company")}
                />
              </div>

              <div className={`${styles.consent} ${styles.wide}`}>
                <label className={styles.checkbox}>
                  <input type="checkbox" checked={fields.consent} onChange={set("consent")} {...a11y("consent")} />
                  <span className={styles.checkboxBox} aria-hidden="true">
                    <Check />
                  </span>
                  <span>
                    Я согласен на{" "}
                    <Link href="/consent" target="_blank" className={styles.link}>
                      обработку персональных данных
                    </Link>
                    .{" "}
                    <Link href="/privacy" target="_blank" className={styles.link}>
                      Политика конфиденциальности
                    </Link>
                  </span>
                </label>
                {err("consent") && (
                  <p id="consent-error" className={styles.error} role="alert">
                    {err("consent")}
                  </p>
                )}
              </div>
            </div>

            {serverError && (
              <p className={styles.serverError} role="alert">
                {serverError}
              </p>
            )}

            <button type="submit" className="btn btn--block" disabled={submitting}>
              {submitting ? "Отправляем…" : `Отправить заявку · ${quantity} шт.`}
              {!submitting && <ArrowRight className="btn__arrow" />}
            </button>
            <p className={styles.note}>
              {region === "ru"
                ? "Оплата и доставка — после подтверждения заявки менеджером. Доставляем по России через СДЭК."
                : "Для заказов вне России стоимость и способ международной доставки рассчитываются индивидуально."}
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({
  id,
  label,
  error,
  required,
  wide,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  required?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`${styles.field} ${wide ? styles.wide : ""}`} data-invalid={error ? "" : undefined}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required && (
          <span className={styles.req} aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
