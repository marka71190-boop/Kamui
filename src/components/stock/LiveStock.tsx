"use client";

/**
 * Живой остаток. Страница приходит с цифрами на момент сборки (обновляется раз в минуту),
 * а в браузере сразу подтягиваются свежие цифры из /api/stock — и потом раз в минуту, пока вкладка открыта.
 * Так изменения в Google Таблице и новые оплаты видны без перезагрузки и без ожидания кэша.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { StockView } from "@/lib/stock";

const LiveStockContext = createContext<StockView | null>(null);

const same = (a: StockView, b: StockView) => a.total === b.total && a.sold === b.sold && a.remaining === b.remaining;

export function LiveStockProvider({ initial, children }: { initial: StockView; children: ReactNode }) {
  const [stock, setStock] = useState<StockView>(initial);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/stock", { cache: "no-store" });
        const d = (await res.json()) as Partial<StockView> & { ok?: boolean };
        if (!alive || !d.ok) return;
        const total = Number(d.total);
        const sold = Number(d.sold);
        const remaining = Number(d.remaining);
        if (![total, sold, remaining].every(Number.isFinite)) return;
        const next = { total, sold, remaining, soldOut: remaining <= 0 };
        setStock((prev) => (same(prev, next) ? prev : next));
      } catch {
        /* нет связи — остаются цифры со страницы */
      }
    };
    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(onVisible, 60_000);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, []);

  return <LiveStockContext.Provider value={stock}>{children}</LiveStockContext.Provider>;
}

/** Актуальный остаток: из LiveStockProvider, а вне его — то, что пришло со страницы. */
export function useLiveStock(fallback: StockView): StockView;
export function useLiveStock(fallback?: StockView): StockView | undefined;
export function useLiveStock(fallback?: StockView): StockView | undefined {
  return useContext(LiveStockContext) ?? fallback;
}
