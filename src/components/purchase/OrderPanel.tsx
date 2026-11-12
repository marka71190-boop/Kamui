"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { cdekCountry, deliveryAreaText, type CdekCountryCode } from "@/config/cdek-countries";
import type { CheckoutConfig } from "@/config/features";
import { GALLERY } from "@/config/gallery";
import { KIT_EVENT, KIT_PHOTO } from "@/config/kit-visual";
import { isKitTip, isWholesale, KIT_TIPS, priceFor, WHOLESALE, type ProductId } from "@/config/products";
import { PRODUCT } from "@/config/site";
import { t } from "@/i18n/dict";
import { RU_MARKET, type Market } from "@/i18n/market";
import { formatMoney } from "@/lib/format";
import { toLatin } from "@/lib/translit";
import { suggestEmail } from "@/lib/orders/email-check";
import {
  digitsOnly,
  formatPhoneInput,
  LIMITS,
  normalizeOrderInput,
  validateOrderInput,
  type FieldErrors,
  type OrderField,
  type OrderInput,
} from "@/lib/orders/validation";
import type { StockView } from "@/lib/stock";
import { useLiveStock } from "@/components/stock/LiveStock";
import { ArrowRight, Check } from "@/components/ui/Icons";
import { StockMeter } from "@/components/ui/StockMeter";
import { CdekPicker, periodText, type CdekSelection, type QuoteState } from "./CdekPicker";
import { CheckoutProgress } from "./CheckoutProgress";
import { OrderNumber, orderStatusHref, SupportLink } from "./OrderExtras";
import { PaymentResult, rememberPayment } from "./PaymentResult";
import { PRODUCT_EVENT } from "./PurchaseVisual";
import { QuantityStepper } from "./QuantityStepper";
import styles from "./Purchase.module.css";

type Stage = "intro" | "form" | "success" | "payment";

type Fields = Omit<OrderInput, "quantity" | "region" | "deliveryCountry" | "payTest" | "lang" | "product" | "tip">;

/** Куда доставляем: страна СДЭК (RU, BY, KZ, AM, KG) или «Другая страна» — заявка менеджеру */
type Destination = CdekCountryCode | "OTHER";

const PAYTEST_KEY = "kamui:paytest";

/** Переход на страницу оплаты формой POST (Robokassa): длинные параметры не упираются в длину ссылки */
function submitPaymentForm({ action, fields }: { action: string; fields: Record<string, string> }) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  form.acceptCharset = "utf-8";
  form.style.display = "none";
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

/** Что принимает Robokassa — подпись у кнопки оплаты для заказов за пределы России */
const ROBOKASSA_METHODS = ["Visa", "Mastercard", "UnionPay", "Мир"];

/** Токен тестовой оплаты: из ссылки ?paytest=… (запоминается на время вкладки). */
function readPayTestToken(): string {
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("paytest");
    if (fromUrl) {
      sessionStorage.setItem(PAYTEST_KEY, fromUrl.slice(0, 64));
      url.searchParams.delete("paytest");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      return fromUrl.slice(0, 64);
    }
    return sessionStorage.getItem(PAYTEST_KEY) ?? "";
  } catch {
    return "";
  }
}

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
  newsletter: false,
  cityCode: 0,
  pickupPoint: "",
  taxId: "",
  trap: "",
};

/**
 * Черновик формы — на время вкладки (sessionStorage): после перезагрузки страницы или возврата
 * со страницы оплаты покупателю не нужно вводить всё заново. Согласие в черновик не попадает.
 */
const DRAFT_KEY = "kamui:order-draft";

interface Draft {
  product: ProductId;
  tip: string;
  quantity: number;
  destination: string;
  open: boolean;
  fields: Partial<Record<keyof Fields, unknown>>;
}

function readDraft(): Draft | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null") as Draft | null;
    return d && typeof d === "object" && d.fields && typeof d.fields === "object" ? d : null;
  } catch {
    return null;
  }
}

function writeDraft(d: Draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* приватный режим — черновика просто не будет */
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* нечего очищать */
  }
}

/** Текстовые поля, которые восстанавливаются из черновика */
const DRAFT_TEXT: (keyof Fields)[] = ["name", "phone", "email", "city", "comment", "country", "postalCode", "address", "pickupPoint", "taxId"];

/** Порядок полей — для фокуса на первой ошибке */
const FIELD_ORDER: OrderField[] = [
  "tip",
  "quantity",
  "deliveryCountry",
  "name",
  "phone",
  "email",
  "taxId",
  "country",
  "city",
  "pickupPoint",
  "postalCode",
  "address",
  "comment",
  "consent",
];

export function OrderPanel({
  stock: initialStock,
  checkout,
  market = RU_MARKET,
}: {
  stock: StockView;
  checkout: CheckoutConfig;
  market?: Market;
}) {
  const stock = useLiveStock(initialStock);
  const lang = market.lang;
  const tx = t(lang).order;
  const maxQuantity = Math.max(0, Math.min(PRODUCT.maxPerOrder, stock.remaining));
  const soldOut = maxQuantity === 0;

  const [stage, setStage] = useState<Stage>("intro");
  const [quantity, setQuantity] = useState(1);
  /** Мел или подарочный набор; у набора — наклейка JOS */
  const [product, setProduct] = useState<ProductId>("chalk");
  const [tip, setTip] = useState("");
  const [destination, setDestination] = useState<Destination>(lang === "en" ? "OTHER" : "RU");
  const region: OrderInput["region"] = destination === "OTHER" ? "intl" : "ru";
  const deliveryCountry: CdekCountryCode = destination === "OTHER" ? "RU" : destination;
  /** Страны доставки СДЭК, включённые на сайте */
  const allCountries: CdekCountryCode[] = checkout.cdek && checkout.cdekCountries?.length ? checkout.cdekCountries : ["RU"];
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** Экран ожидания: что показываем и ушёл ли покупатель на страницу ЮKassa */
  const [progress, setProgress] = useState<{ mode: "pay" | "request"; redirecting: boolean; orderId?: string; payUrl?: string }>({
    mode: "pay",
    redirecting: false,
  });
  const [serverError, setServerError] = useState("");
  /** Подсказка при опечатке в почте: исправленный адрес; confirmed — адрес, который покупатель подтвердил как верный */
  const [emailFix, setEmailFix] = useState<string | null>(null);
  const [emailConfirmed, setEmailConfirmed] = useState("");
  const [emailProblem, setEmailProblem] = useState("");
  const [orderId, setOrderId] = useState("");
  const [successText, setSuccessText] = useState(tx.successText);
  const [quote, setQuote] = useState<QuoteState>({ state: "idle" });
  const [payTest, setPayTest] = useState("");
  const [payMethods, setPayMethods] = useState<string[]>([]);
  /** Robokassa в тестовом режиме: страны за пределами России видны только по секретной ссылке */
  const countries: CdekCountryCode[] = checkout.robokassaTest && !payTest ? ["RU"] : allCountries;
  const rootRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Тестовая оплата по секретной ссылке + возврат со страницы оплаты: /?order=KA-...[&payment=rk-…]#buy
  useEffect(() => {
    const token = checkout.paymentsTest || checkout.robokassaTest ? readPayTestToken() : "";
    setPayTest(token);
    const params = new URLSearchParams(window.location.search);
    const id = params.get("order");
    if (id && /^KA-\d{6}-[A-Z0-9]{4}$/.test(id)) {
      // Возврат с Robokassa: номер счёта в ссылке — по нему проверяется оплата
      const pid = params.get("payment") ?? "";
      if (/^rk-\d{1,19}$/.test(pid)) rememberPayment(id, pid);
      setOrderId(id);
      setStage(checkout.payments || checkout.robokassa || token ? "payment" : "success");
    }
  }, [checkout.payments, checkout.paymentsTest, checkout.robokassa, checkout.robokassaTest]);

  // Вернулись кнопкой «Назад» со страницы ЮKassa — браузер мог восстановить страницу с открытым экраном ожидания
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      setSubmitting(false);
      setProgress((p) => ({ ...p, redirecting: false }));
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  // Черновик формы: восстанавливаем после перезагрузки или возврата со страницы оплаты…
  const [draftLoaded, setDraftLoaded] = useState(false);
  useEffect(() => {
    const d = readDraft();
    if (d) {
      if (d.product === "chalk" || d.product === "kit") setProduct(d.product);
      if (isKitTip(d.tip)) setTip(d.tip);
      if (Number.isInteger(d.quantity) && d.quantity >= 1) setQuantity(Math.min(d.quantity, PRODUCT.maxPerOrder));
      if (lang === "ru" && (d.destination === "OTHER" || allCountries.includes(d.destination as CdekCountryCode)))
        setDestination(d.destination as Destination);
      const restored: Partial<Fields> = {};
      for (const k of DRAFT_TEXT) {
        const v = d.fields[k];
        if (typeof v === "string") (restored as Record<string, unknown>)[k] = v.slice(0, 600);
      }
      const code = Number(d.fields.cityCode);
      if (Number.isInteger(code) && code > 0) restored.cityCode = code;
      setFields((f) => ({ ...f, ...restored }));
      if (d.open) setStage((s) => (s === "intro" ? "form" : s));
    }
    setDraftLoaded(true);
    // один раз при открытии страницы
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // …и сохраняем при каждом изменении (без согласия и служебных полей)
  useEffect(() => {
    if (!draftLoaded || (stage !== "intro" && stage !== "form")) return;
    const { consent: _c, newsletter: _n, trap: _t, ...rest } = fields;
    writeDraft({ product, tip, quantity, destination, open: stage === "form", fields: rest });
  }, [draftLoaded, fields, product, tip, quantity, destination, stage]);

  /** Заказ оформлен или оплачен — форма начинается с чистого листа */
  const forgetDraft = () => {
    clearDraft();
    setFields(EMPTY);
    setQuantity(1);
    setSubmitted(false);
  };

  /** Онлайн-оплата включена для этого посетителя */
  const paymentsOn = checkout.payments || (checkout.paymentsTest && payTest !== "");

  // Способы оплаты, подключённые в ЮKassa, — для подписи у кнопки
  useEffect(() => {
    if (!paymentsOn) return;
    const ctrl = new AbortController();
    fetch("/api/payments/methods", { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d: { methods?: string[] }) => setPayMethods(Array.isArray(d.methods) ? d.methods : []))
      .catch(() => {});
    return () => ctrl.abort();
  }, [paymentsOn]);
  const useCdek = checkout.cdek && region === "ru";
  /** Заказы с доставкой СДЭК за пределы России оплачиваются через Robokassa (карты зарубежных банков) */
  const viaRobokassa = region === "ru" && deliveryCountry !== "RU" && checkout.robokassa;
  const payOnline = viaRobokassa || (paymentsOn && region === "ru");
  const payProvider = viaRobokassa ? "Robokassa" : "ЮKassa";
  const rules = (r: OrderInput["region"]) => ({ maxQuantity, requirePickupPoint: checkout.cdek && r === "ru", countries });
  const where = (d: Destination) => ({
    region: (d === "OTHER" ? "intl" : "ru") as OrderInput["region"],
    deliveryCountry: d === "OTHER" ? "RU" : d,
  });

  const input = (): OrderInput =>
    normalizeOrderInput({ ...fields, quantity, product, tip, ...where(destination), payTest, lang });

  const revalidate = (
    next: Partial<Fields> = {},
    nextDest = destination,
    nextQty = quantity,
    nextGoods: { product: ProductId; tip: string } = { product, tip },
  ) => {
    if (!submitted) return;
    const w = where(nextDest);
    setErrors(
      validateOrderInput(
        normalizeOrderInput({ ...fields, ...next, ...w, ...nextGoods, quantity: nextQty, lang }),
        rules(w.region),
      ),
    );
  };

  // Фото рядом с формой меняется вместе с выбором
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(PRODUCT_EVENT, { detail: product }));
  }, [product]);

  // Расчёт доставки при смене товара пересчитывает сам выбор ПВЗ (CdekPicker следит за product)
  const changeProduct = (p: ProductId) => {
    setProduct(p);
    revalidate({}, destination, quantity, { product: p, tip });
  };

  const changeTip = (t: string) => {
    setTip(t);
    revalidate({}, destination, quantity, { product, tip: t });
  };

  // «Заказать набор» в блоке подарочного набора: выбираем набор (и наклейку, если её уже выбрали там)
  const kitChoiceRef = useRef<(t?: string) => void>(() => {});
  kitChoiceRef.current = (t?: string) => {
    const nextTip = isKitTip(t) ? t : tip;
    setProduct("kit");
    setTip(nextTip);
    revalidate({}, destination, quantity, { product: "kit", tip: nextTip });
  };
  useEffect(() => {
    const onKit = (e: Event) => kitChoiceRef.current((e as CustomEvent<{ tip?: string }>).detail?.tip);
    window.addEventListener(KIT_EVENT, onKit);
    return () => window.removeEventListener(KIT_EVENT, onKit);
  }, []);

  const set =
    <K extends keyof Fields>(key: K) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      let value: Fields[K];
      if (key === "consent" || key === "newsletter") value = (e.target as HTMLInputElement).checked as Fields[K];
      else if (key === "taxId") value = digitsOnly(e.target.value).slice(0, 14) as Fields[K];
      else if (key === "phone" && region === "ru") value = formatPhoneInput(e.target.value, deliveryCountry) as Fields[K];
      // Для отправки за рубеж ФИО нужно латиницей — переводим сразу при вводе
      else if (key === "name" && region === "intl") value = toLatin(e.target.value) as Fields[K];
      else value = e.target.value as Fields[K];
      setFields((f) => ({ ...f, [key]: value }));
      revalidate({ [key]: value } as Partial<Fields>);
    };

  const changeCdek = (sel: CdekSelection) => {
    setFields((f) => ({ ...f, ...sel }));
    revalidate(sel);
  };

  const changeQuantity = (q: number) => {
    setQuantity(q);
    revalidate({}, destination, q);
  };

  const changeDestination = (e: ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as Destination;
    if (next === destination) return;
    // Город и пункт выдачи относятся к стране — выбираются заново
    const patch: Partial<Fields> = { city: "", cityCode: 0, pickupPoint: "", taxId: "" };
    // В поле только код страны (+7, +375…) — очищаем, чтобы подставился код новой страны
    if (digitsOnly(fields.phone).length <= 3) patch.phone = "";
    // Для отправки в другие страны ФИО нужно латиницей
    if (next === "OTHER") patch.name = toLatin(fields.name);
    setDestination(next);
    setQuote({ state: "idle" });
    setFields((f) => ({ ...f, ...patch }));
    revalidate(patch, next);
  };

  const openForm = () => {
    setStage("form");
    window.setTimeout(() => firstFieldRef.current?.focus({ preventScroll: true }), 450);
  };

  const emailTx =
    lang === "en"
      ? { ask: "Did you mean", fix: "Yes, fix it", keep: "No, it is correct", confirmFirst: "Please check your email: we send the payment confirmation and tracking number there" }
      : { ask: "Вы имели в виду", fix: "Да, исправить", keep: "Нет, адрес верный", confirmFirst: "Проверьте почту: туда придут чек и трек-номер" };

  /** При уходе из поля: подсказка об опечатке и проверка домена на сервере */
  const checkEmail = async () => {
    const value = fields.email.trim().toLowerCase();
    setEmailProblem("");
    if (!value) return setEmailFix(null);
    const local = suggestEmail(value);
    setEmailFix(local && emailConfirmed !== value ? local : null);
    try {
      const res = await fetch(`/api/email-check?email=${encodeURIComponent(value)}&lang=${lang}`);
      const body = (await res.json()) as { ok?: boolean; problem?: string; suggestion?: string | null };
      if (body.problem) setEmailProblem(body.problem);
      else if (body.suggestion && emailConfirmed !== value) setEmailFix(body.suggestion);
    } catch {
      /* сеть не отвечает — сервер проверит при отправке */
    }
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (stage !== "form" || submitting) return;
    setSubmitted(true);
    setServerError("");

    const data = input();
    const errs = validateOrderInput(data, rules(data.region));
    setErrors(errs);
    const firstInvalid = FIELD_ORDER.find((f) => errs[f]);
    if (firstInvalid) {
      rootRef.current?.querySelector<HTMLElement>(`[data-field="${firstInvalid}"]`)?.focus();
      return;
    }

    // Опечатка в почте (например, tandex.ru): спрашиваем один раз, прежде чем отправлять заказ
    const fix = suggestEmail(data.email);
    if (fix && emailConfirmed !== data.email) {
      setEmailFix(fix);
      rootRef.current?.querySelector<HTMLElement>('[data-field="email"]')?.focus();
      return;
    }

    setProgress({ mode: payOnline ? "pay" : "request", redirecting: false });
    setSubmitting(true);
    // Без ответа дольше минуты — сообщаем, а не держим экран ожидания бесконечно
    const ctrl = new AbortController();
    const timeout = window.setTimeout(() => ctrl.abort(), 60_000);
    let leaving = false;
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: ctrl.signal,
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        orderId?: string;
        paymentId?: string;
        paymentUrl?: string;
        paymentUnavailable?: boolean;
        /** Robokassa: поля для перехода на оплату формой POST */
        paymentForm?: { action: string; fields: Record<string, string> };
        error?: string;
        fieldErrors?: FieldErrors;
      };
      if (res.ok && body.ok && body.orderId) {
        if (body.paymentUrl) {
          if (body.paymentId) rememberPayment(body.orderId, body.paymentId);
          // Экран ожидания остаётся, пока браузер открывает страницу ЮKassa
          leaving = true;
          const url = body.paymentUrl;
          setProgress({ mode: "pay", redirecting: true, orderId: body.orderId, payUrl: url });
          const form = body.paymentForm;
          window.setTimeout(() => (form ? submitPaymentForm(form) : window.location.assign(url)), 250);
          return;
        }
        setSuccessText(body.paymentUnavailable ? tx.noPaymentText : tx.successText);
        setOrderId(body.orderId);
        setStage("success");
        forgetDraft();
        rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        if (body.fieldErrors) setErrors(body.fieldErrors);
        setServerError(body.error || tx.failed);
      }
    } catch {
      setServerError(ctrl.signal.aborted ? tx.progress.timeout : tx.offline);
    } finally {
      window.clearTimeout(timeout);
      if (!leaving) setSubmitting(false);
    }
  };

  // Заказ из-за рубежа с оплатой через Robokassa: цены в долларах, оплата — в рублях по курсу ЦБ
  const abroad = viaRobokassa ? checkout.abroad : undefined;
  const kit = product === "kit";
  /** Цены в валюте заказа: мел, набор и мел по оптовой цене (от 10 шт.) */
  const prices = abroad
    ? { unit: abroad.unitUsd, kit: abroad.kitUsd, wholesale: abroad.wholesaleUsd }
    : { unit: market.unitPrice, kit: market.kitPrice, wholesale: market.wholesalePrice };
  const priceOf = (p: ProductId, q = quantity) => priceFor(p, q, prices);
  const unitPrice = priceOf(product);
  /** Оптовая цена мела действует (от 10 шт.) */
  const wholesaleNow = isWholesale(product, quantity);
  /** Сколько покупатель экономит на оптовой цене */
  const saving = wholesaleNow ? (prices.unit - prices.wholesale) * quantity : 0;
  const money = (v: number) => formatMoney(v, abroad ? "USD" : market.currency);
  const total = unitPrice * quantity;
  const formOpen = stage === "form";
  const deliveryCost =
    useCdek && quote.state === "ready"
      ? checkout.freeDelivery
        ? 0
        : abroad
          ? (quote.quote.usd ?? Math.ceil(quote.quote.cost / abroad.rate))
          : quote.quote.cost
      : 0;
  const grandTotal = total + deliveryCost;
  /** Сколько спишется в рублях (для заказов из-за рубежа) */
  const payRub = abroad
    ? Math.round(unitPrice * abroad.rate) * quantity + Math.round(deliveryCost * abroad.rate)
    : grandTotal;

  const resetAfterReturn = () => {
    setStage("intro");
    setOrderId("");
    if (window.location.search) window.history.replaceState(null, "", window.location.pathname + "#buy");
  };

  if (stage === "payment") {
    return (
      <div ref={rootRef} className={styles.panel}>
        <PaymentResult orderId={orderId} onReset={resetAfterReturn} onPaid={forgetDraft} />
      </div>
    );
  }

  if (stage === "success") {
    return (
      <div ref={rootRef} className={styles.success} role="status" aria-live="polite">
        <span className={styles.successIcon} aria-hidden="true">
          <Check />
        </span>
        <p className={styles.successTitle}>{tx.successTitle}</p>
        <p className={styles.successText}>{successText}</p>
        {orderId && <OrderNumber id={orderId} label={tx.orderNumber} lang={lang} />}
        {orderId && (
          <p className={styles.successText}>
            {tx.checkMail}{" "}
            <a href={orderStatusHref(orderId, lang)} className={styles.link}>
              {lang === "en" ? "Track your order" : "Где мой заказ"}
            </a>
          </p>
        )}
        <SupportLink lang={lang} />
        <button
          type="button"
          className="btn btn--ghost"
          onClick={resetAfterReturn}
        >
          {tx.again}
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
      <form onSubmit={onSubmit} noValidate aria-label={tx.formAria} lang={lang}>
        <fieldset id="order-product" className={styles.products}>
          <legend className="visually-hidden">{tx.productAria}</legend>
          {(["chalk", "kit"] as const).map((p) => (
            <label key={p} className={styles.productOption} data-active={product === p || undefined}>
              <input
                type="radio"
                name="product"
                value={p}
                checked={product === p}
                onChange={() => changeProduct(p)}
                className={styles.productRadio}
              />
              <span className={styles.productThumb} aria-hidden="true">
                <Image
                  src={p === "kit" ? KIT_PHOTO : GALLERY[2].src}
                  alt=""
                  fill
                  sizes="64px"
                  style={{ objectPosition: p === "kit" ? "52% 62%" : "50% 50%" }}
                />
              </span>
              <span className={styles.productText}>
                <b>{p === "kit" ? tx.kitOption : tx.chalkOption}</b>
                <span>{p === "kit" ? tx.kitOptionSub : tx.chalkOptionSub}</span>
              </span>
              <span className={styles.productPrice}>
                {money(priceOf(p))}
                {p === "chalk" &&
                  (isWholesale(p, quantity) ? (
                    <s>{money(prices.unit)}</s>
                  ) : (
                    <small>{tx.wholesaleFrom(WHOLESALE.minQty, money(prices.wholesale))}</small>
                  ))}
              </span>
            </label>
          ))}
        </fieldset>

        {kit && (
          <fieldset className={styles.tipRow} data-invalid={err("tip") ? "" : undefined}>
            <legend className={styles.label}>
              {tx.tipLabel}
              <span className={styles.req} aria-hidden="true">
                *
              </span>
            </legend>
            <div className={styles.tips}>
              {KIT_TIPS.map((t, i) => (
                <label key={t} className={styles.tipChip} data-active={tip === t || undefined}>
                  <input
                    type="radio"
                    name="tip"
                    value={t}
                    checked={tip === t}
                    onChange={() => changeTip(t)}
                    className={styles.productRadio}
                    {...(i === 0 ? a11y("tip") : { "aria-invalid": err("tip") ? true : undefined })}
                  />
                  <span>{t}</span>
                </label>
              ))}
            </div>
            {err("tip") ? (
              <p id="tip-error" className={styles.error} role="alert">
                {err("tip")}
              </p>
            ) : (
              <p className={styles.hint}>{tx.tipHint}</p>
            )}
          </fieldset>
        )}

        <div className={styles.summary}>
          <div>
            <p className={styles.productName}>{kit ? tx.kitName : "Kamui × Iosif Abramov"}</p>
            <p className={styles.productSub}>{kit ? tx.kitSub : "Limited Edition 0.98 β"}</p>
          </div>
          <p className={styles.bigPrice}>
            {wholesaleNow && <s className={styles.oldPrice}>{money(prices.unit)}</s>}
            {money(unitPrice)}
            <span>
              {kit ? tx.perKit : tx.perPiece}
              {wholesaleNow && ` · ${tx.wholesaleBadge}`}
            </span>
          </p>
        </div>

        <StockMeter stock={stock} compact className={styles.stock} lang={lang} />

        <div className={styles.qtyRow}>
          <span id="qty-label" className={styles.qtyLabel}>
            {tx.quantity}
          </span>
          <QuantityStepper
            value={quantity}
            max={Math.max(1, maxQuantity)}
            onChange={changeQuantity}
            labelledBy="qty-label"
            disabled={soldOut}
            lang={lang}
          />
          <p className={styles.total}>
            <span>{formOpen && (useCdek || payOnline) ? tx.goods : tx.total}</span>
            <b>{money(total)}</b>
          </p>
          {!kit && !soldOut && (
            <p className={styles.wholesale} data-on={wholesaleNow || undefined} aria-live="polite">
              <span>
                {wholesaleNow
                  ? tx.wholesaleOn(WHOLESALE.minQty, money(saving))
                  : tx.wholesaleHint(WHOLESALE.minQty, money(prices.wholesale))}
              </span>
              {!wholesaleNow && maxQuantity >= WHOLESALE.minQty && (
                <button type="button" className={styles.wholesaleBtn} onClick={() => changeQuantity(WHOLESALE.minQty)}>
                  {tx.wholesaleTake(WHOLESALE.minQty)}
                </button>
              )}
            </p>
          )}
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
              {soldOut ? tx.soldOut : paymentsOn ? tx.placeOrder : tx.request}
              {!soldOut && <ArrowRight className="btn__arrow" />}
            </button>
            <p className={styles.note}>
              {paymentsOn ? tx.notePay(payMethods, deliveryAreaText(countries)) : tx.noteRequest}
              {paymentsOn && checkout.robokassa && countries.length > 1 && ` ${tx.noteRobokassa}`}
            </p>
            <SupportLink lang={lang} text={lang === "en" ? "Questions before ordering?" : "Остались вопросы перед заказом?"} />
          </div>
        )}

        <div id="order-fields" className={styles.collapse} data-open={formOpen || undefined}>
          <div className={styles.collapseInner} inert={!formOpen}>
            <div className={styles.fields}>
              {lang === "ru" && (
                <Field
                  id="deliveryCountry"
                  label={tx.destination}
                  hint={
                    destination === "OTHER"
                      ? tx.destinationHintOther
                      : !checkout.cdek
                        ? undefined
                        : destination === "RU"
                          ? tx.destinationHintRu
                          : checkout.robokassa
                            ? tx.destinationHintRobokassa
                            : tx.destinationHintCdek
                  }
                  error={err("deliveryCountry")}
                  wide
                >
                  <div className={styles.selectWrap}>
                    <select
                      id="deliveryCountry"
                      name="deliveryCountry"
                      autoComplete="off"
                      value={destination}
                      onChange={changeDestination}
                      {...a11y("deliveryCountry")}
                    >
                      {countries.map((c) => (
                        <option key={c} value={c}>
                          {cdekCountry(c).name}
                        </option>
                      ))}
                      <option value="OTHER">{tx.otherCountry}</option>
                    </select>
                  </div>
                </Field>
              )}

              <Field
                id="name"
                label={region === "intl" ? tx.nameLatin : tx.name}
                hint={region === "intl" ? tx.nameLatinHint : tx.nameHint}
                error={err("name")}
                required
                wide
              >
                <input
                  ref={firstFieldRef}
                  id="name"
                  name="name"
                  autoComplete="name"
                  maxLength={LIMITS.name}
                  value={fields.name}
                  onChange={set("name")}
                  placeholder={region === "intl" ? tx.nameLatinPlaceholder : tx.namePlaceholder}
                  autoCapitalize="words"
                  spellCheck={false}
                  {...a11y("name")}
                />
              </Field>

              <Field id="phone" label={tx.phone} error={err("phone")} required>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={LIMITS.phone}
                  value={fields.phone}
                  onChange={set("phone")}
                  placeholder={region === "ru" ? cdekCountry(deliveryCountry).example : "+49 30 1234567"}
                  {...a11y("phone")}
                />
              </Field>

              <Field id="email" label={tx.email} error={err("email")} required>
                <input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  maxLength={LIMITS.email}
                  value={fields.email}
                  onChange={(e) => {
                    set("email")(e);
                    setEmailFix(null);
                    setEmailProblem("");
                  }}
                  onBlur={checkEmail}
                  placeholder="you@example.com"
                  {...a11y("email")}
                />
                {emailProblem && !err("email") && (
                  <p className={styles.error} role="alert">
                    {emailProblem}
                  </p>
                )}
                {emailFix && (
                  <div className={styles.emailFix} role="alert">
                    <span>
                      {emailTx.ask} <b>{emailFix}</b>?
                    </span>
                    <span className={styles.emailFixBtns}>
                      <button
                        type="button"
                        onClick={() => {
                          const fixed = emailFix;
                          setFields((f) => ({ ...f, email: fixed }));
                          setEmailFix(null);
                          setEmailProblem("");
                          revalidate({ email: fixed });
                        }}
                      >
                        {emailTx.fix}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEmailConfirmed(fields.email.trim().toLowerCase());
                          setEmailFix(null);
                        }}
                      >
                        {emailTx.keep}
                      </button>
                    </span>
                  </div>
                )}
              </Field>

              {region === "ru" && (deliveryCountry === "KZ" || deliveryCountry === "KG") && (
                <Field
                  id="taxId"
                  label={deliveryCountry === "KZ" ? tx.taxIdKz : tx.taxIdKg}
                  hint={deliveryCountry === "KZ" ? tx.taxIdKzHint : tx.taxIdKgHint}
                  error={err("taxId")}
                  required
                >
                  <input
                    id="taxId"
                    name="taxId"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={deliveryCountry === "KZ" ? 12 : 14}
                    value={fields.taxId}
                    onChange={set("taxId")}
                    placeholder={deliveryCountry === "KZ" ? "12 цифр" : "14 цифр"}
                    {...a11y("taxId")}
                  />
                </Field>
              )}

              {region === "intl" && (
                <Field id="country" label={tx.country} error={err("country")} required>
                  <input
                    id="country"
                    name="country"
                    autoComplete="country-name"
                    maxLength={LIMITS.country}
                    value={fields.country}
                    onChange={set("country")}
                    placeholder={tx.countryPlaceholder}
                    {...a11y("country")}
                  />
                </Field>
              )}

              {useCdek ? (
                <CdekPicker
                  key={deliveryCountry}
                  country={deliveryCountry}
                  value={{ city: fields.city, cityCode: fields.cityCode, pickupPoint: fields.pickupPoint }}
                  quantity={quantity}
                  product={product}
                  freeDelivery={checkout.freeDelivery}
                  cityError={err("city")}
                  pointError={err("pickupPoint")}
                  onChange={changeCdek}
                  onQuote={setQuote}
                />
              ) : (
                <Field id="city" label={tx.city} error={err("city")} required>
                  <input
                    id="city"
                    name="city"
                    autoComplete="address-level2"
                    maxLength={LIMITS.city}
                    value={fields.city}
                    onChange={set("city")}
                    placeholder={region === "ru" ? tx.cityPlaceholderRu : tx.cityPlaceholderIntl}
                    {...a11y("city")}
                  />
                </Field>
              )}

              {region === "intl" && (
                <>
                  <Field id="postalCode" label={tx.postalCode} error={err("postalCode")} required>
                    <input
                      id="postalCode"
                      name="postalCode"
                      autoComplete="postal-code"
                      maxLength={LIMITS.postalCode}
                      value={fields.postalCode}
                      onChange={set("postalCode")}
                      placeholder={tx.postalPlaceholder}
                      {...a11y("postalCode")}
                    />
                  </Field>
                  <Field id="address" label={tx.address} error={err("address")} required wide>
                    <input
                      id="address"
                      name="address"
                      autoComplete="street-address"
                      maxLength={LIMITS.address}
                      value={fields.address}
                      onChange={set("address")}
                      placeholder={tx.addressPlaceholder}
                      {...a11y("address")}
                    />
                  </Field>
                </>
              )}

              <Field id="comment" label={tx.comment} error={err("comment")} wide>
                <textarea
                  id="comment"
                  name="comment"
                  rows={3}
                  maxLength={LIMITS.comment}
                  value={fields.comment}
                  onChange={set("comment")}
                  placeholder={region === "ru" ? tx.commentPlaceholderRu : tx.commentPlaceholderIntl}
                  {...a11y("comment")}
                />
              </Field>

              {/* Ловушка для ботов: скрыта от людей */}
              <div className={styles.hp} aria-hidden="true">
                <label htmlFor="kx-trap">Leave empty</label>
                <input
                  id="kx-trap"
                  name="kx-trap"
                  tabIndex={-1}
                  autoComplete="off"
                  value={fields.trap}
                  onChange={set("trap")}
                />
              </div>

              <div className={`${styles.consent} ${styles.wide}`}>
                <label className={styles.checkbox}>
                  <input type="checkbox" checked={fields.consent} onChange={set("consent")} {...a11y("consent")} />
                  <span className={styles.checkboxBox} aria-hidden="true">
                    <Check />
                  </span>
                  <span>
                    {tx.consentBefore}{" "}
                    <Link href="/consent" target="_blank" className={styles.link}>
                      {tx.consentLink}
                    </Link>
                    .{" "}
                    <Link href="/privacy" target="_blank" className={styles.link}>
                      {tx.privacyLink}
                    </Link>
                  </span>
                </label>
                {err("consent") && (
                  <p id="consent-error" className={styles.error} role="alert">
                    {err("consent")}
                  </p>
                )}
                <p className={styles.consentNote}>{tx.newsletter}</p>
              </div>
            </div>

            {(useCdek || payOnline) && (
              <div className={styles.breakdown} aria-live="polite">
                <p className={styles.breakdownRow}>
                  <span>
                    {kit ? tx.goodsKit : "Товар"} · {quantity} шт.
                  </span>
                  <b>{money(total)}</b>
                </p>
                <p className={styles.breakdownRow}>
                  <span>
                    Доставка СДЭК
                    {useCdek && quote.state === "ready" && periodText(quote.quote) ? ` · ${periodText(quote.quote)}` : ""}
                  </span>
                  <b>
                    {!useCdek
                      ? checkout.freeDelivery
                        ? "бесплатно"
                        : "оплачивается при получении"
                      : quote.state === "ready"
                        ? deliveryCost === 0
                          ? "бесплатно"
                          : money(deliveryCost)
                        : quote.state === "loading"
                          ? "считаем…"
                          : quote.state === "error"
                            ? "уточним после заявки"
                            : "выберите город"}
                  </b>
                </p>
                <p className={`${styles.breakdownRow} ${styles.breakdownTotal}`}>
                  <span>{payOnline ? "К оплате" : "Итого"}</span>
                  <b>{money(grandTotal)}</b>
                </p>
                {abroad && (
                  <p className={styles.breakdownNote}>
                    {tx.payInRub(formatMoney(payRub, "RUB"), formatMoney(Math.round(abroad.rate * 100) / 100, "RUB"))}
                  </p>
                )}
              </div>
            )}

            {serverError && (
              <p className={styles.serverError} role="alert">
                {serverError}
              </p>
            )}

            <button type="submit" className="btn btn--block" disabled={submitting}>
              {submitting
                ? payOnline
                  ? tx.toPayment
                  : tx.sending
                : payOnline && !(useCdek && quote.state === "error")
                  ? tx.pay(money(grandTotal))
                  : tx.send(quantity)}
              {!submitting && <ArrowRight className="btn__arrow" />}
            </button>
            {payOnline ? (
              <div className={styles.payNote}>
                <span>
                  Нажимая кнопку, вы принимаете условия{" "}
                  <Link href="/oferta" target="_blank" className={styles.link}>
                    оферты
                  </Link>
                  . Безопасная оплата на странице {payProvider}
                  {!viaRobokassa && checkout.paymentsTest && " · тестовый режим: деньги не списываются"}
                </span>
                <span className={styles.payMethods} aria-label="Способы оплаты">
                  {(viaRobokassa ? ROBOKASSA_METHODS : payMethods.length > 0 ? payMethods : ["Банковская карта"]).map((m) => (
                    <span key={m}>{m}</span>
                  ))}
                </span>
                {deliveryCountry !== "RU" && (
                  <span className={styles.abroadPay}>{viaRobokassa ? tx.abroadPayRobokassa : tx.abroadPay}</span>
                )}
              </div>
            ) : (
              <p className={styles.note}>
                {region === "ru"
                  ? useCdek
                    ? "Оплата — после подтверждения заявки менеджером. Доставка СДЭК до выбранного пункта выдачи."
                    : "Оплата и доставка — после подтверждения заявки менеджером. Доставляем по России через СДЭК."
                  : tx.noteIntl}
              </p>
            )}
            <SupportLink lang={lang} text={lang === "en" ? "Questions before ordering?" : "Остались вопросы перед заказом?"} />
            {tx.otherVersion && (
              <p className={styles.note}>
                {tx.otherVersion.text}{" "}
                <a href={tx.otherVersion.href} hrefLang="ru" className={styles.link}>
                  {tx.otherVersion.link}
                </a>
              </p>
            )}
          </div>
        </div>
      </form>
      {submitting && (
        <CheckoutProgress
          mode={progress.mode}
          redirecting={progress.redirecting}
          orderId={progress.orderId}
          payUrl={progress.payUrl}
          provider={payProvider}
          lang={lang}
        />
      )}
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  required,
  wide,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
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
      {hint && !error && <p className={styles.hint}>{hint}</p>}
      {error && (
        <p id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
