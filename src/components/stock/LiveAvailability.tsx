"use client";

import { t } from "@/i18n/dict";
import type { Lang } from "@/i18n/lang";
import type { StockView } from "@/lib/stock";
import { CountUp } from "@/components/ui/CountUp";
import { useLiveStock } from "./LiveStock";

/** «Доступно сейчас: N осталось · продано M» в разделе «Коллекция». */
export function LiveAvailability({
  stock: initial,
  lang,
  numClassName,
  unitClassName,
}: {
  stock: StockView;
  lang: Lang;
  numClassName?: string;
  unitClassName?: string;
}) {
  const stock = useLiveStock(initial);
  return (
    <>
      <CountUp value={stock.remaining} className={numClassName} lang={lang} />
      <span className={unitClassName}>{t(lang).collection.availableUnit(stock.sold)}</span>
    </>
  );
}
