"use client";

import { useEffect } from "react";

/** Проставляет язык документа (<html lang>) для английской версии страницы. */
export function HtmlLang({ lang }: { lang: string }) {
  useEffect(() => {
    const prev = document.documentElement.lang;
    document.documentElement.lang = lang;
    return () => {
      document.documentElement.lang = prev;
    };
  }, [lang]);
  return null;
}
