import { features } from "@/config/features";

/**
 * Сколько платит покупатель за доставку: тариф СДЭК + наценка (DELIVERY_MARKUP_PERCENT),
 * округлено вверх до рубля. При DELIVERY_PRICE_MODE=free — 0.
 */
export function customerDeliveryPrice(tariffCost: number): number {
  if (features.freeDelivery) return 0;
  return Math.ceil(Math.max(0, tariffCost) * (1 + features.deliveryMarkupPercent / 100));
}
