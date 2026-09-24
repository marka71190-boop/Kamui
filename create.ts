import { PRODUCT } from "@/config/site";
import { features } from "@/config/features";
import { generateOrderId } from "./id";
import { saveOrder } from "./store";
import type { Order } from "./types";
import { normalizePhone, type OrderInput } from "./validation";

/** Собирает заказ из проверенной формы и сохраняет его. */
export async function createOrder(input: OrderInput, meta: Order["meta"] = {}): Promise<Order> {
  const isRu = input.region === "ru";
  const order: Order = {
    id: generateOrderId(),
    createdAt: new Date().toISOString(),
    status: features.payments ? "awaiting_payment" : "new",
    region: input.region,
    customer: {
      name: input.name,
      phone: normalizePhone(input.phone, input.region) ?? input.phone,
      email: input.email,
    },
    address: isRu
      ? { country: "Россия", city: input.city }
      : { country: input.country, city: input.city, postalCode: input.postalCode, address: input.address },
    quantity: input.quantity,
    unitPrice: PRODUCT.price,
    total: PRODUCT.price * input.quantity,
    currency: "RUB",
    comment: input.comment,
    delivery: isRu
      ? { provider: "cdek", label: "СДЭК — уточняется" }
      : { provider: "international", label: "Международная доставка — уточняется" },
    meta,
  };
  await saveOrder(order);
  return order;
}
