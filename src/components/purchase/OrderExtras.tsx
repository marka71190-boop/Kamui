"use client";

import { useState } from "react";
import { SELLER, telegramUrl } from "@/config/site";
import type { Lang } from "@/i18n/lang";
import { Telegram } from "@/components/ui/Icons";
import styles from "./Purchase.module.css";

/** Номер заказа с кнопкой «Скопировать» */
export function OrderNumber({ id, label, lang = "ru" }: { id: string; label: string; lang?: Lang }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setDone(true);
      window.setTimeout(() => setDone(false), 2000);
    } catch {
      /* буфер обмена недоступен — номер можно выделить вручную */
    }
  };
  const tx = lang === "en" ? { copy: "Copy", done: "Copied" } : { copy: "Скопировать", done: "Скопировано" };
  return (
    <p className={styles.orderId}>
      {label} <b>{id}</b>
      <button type="button" className={styles.copyBtn} onClick={copy} data-done={done || undefined} aria-live="polite">
        {done ? tx.done : tx.copy}
      </button>
    </p>
  );
}

/** «Есть вопрос? Напишите в Telegram» — ничего не показывает, если Telegram не указан в настройках */
export function SupportLink({ lang = "ru", text }: { lang?: Lang; text?: string }) {
  const url = telegramUrl();
  if (!url) return null;
  return (
    <p className={styles.support}>
      <span>{text ?? (lang === "en" ? "Any questions?" : "Есть вопрос по заказу?")}</span>
      <a href={url} target="_blank" rel="noopener noreferrer">
        <Telegram />
        {lang === "en" ? "Message us on Telegram" : "Напишите в Telegram"} @{SELLER.telegram}
      </a>
    </p>
  );
}

/** Ссылка «Статус заказа» на страницу /order с подставленным номером */
export const orderStatusHref = (id: string, lang: Lang = "ru") =>
  `/order?id=${encodeURIComponent(id)}${lang === "en" ? "&lang=en" : ""}`;
