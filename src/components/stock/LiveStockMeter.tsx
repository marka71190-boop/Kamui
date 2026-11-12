"use client";

import type { ComponentProps } from "react";
import { StockMeter } from "@/components/ui/StockMeter";
import { useLiveStock } from "./LiveStock";

/** Шкала остатка с живыми цифрами. */
export function LiveStockMeter({ stock, ...rest }: ComponentProps<typeof StockMeter>) {
  return <StockMeter stock={useLiveStock(stock)} {...rest} />;
}
