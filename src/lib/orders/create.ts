import { cdekCountry } from "@/config/cdek-countries";
import { isWholesale, kitOrderNote, productPrice, wholesaleOrderNote } from "@/config/products";
import { SHOP } from "@/config/site";
import { formatPrice } from "@/lib/format";
import { generateOrderId } from "./id";
import { saveOrder } from "./store";
import type { Order, OrderDelivery } from "./types";
import { normalizePhone, type OrderInput } from "./validation";

/**
 * Город для таблицы и накладной. Для доставки за пределы России в конце всегда стоит страна:
 * «Минск, Беларусь» — чтобы менеджер сразу видел, куда заказ.
 */
export function cityWithCountry(input: Pick<OrderInput, "city" | "deliveryCountry">): string {
  if (input.deliveryCountry === "RU") return input.city;
  const name = cdekCountry(input.deliveryCountry).name;
  return input.city.toLowerCase().includes(name.toLowerCase()) ? input.city : `${input.city}, ${name}`;
}

/** Строка в «Комментарии»: покупатель согласился получать письма о заказе (подтверждение оплаты, трек-номер) */
export const NEWSLETTER_NOTE = "Согласие на письма о заказе (трек-номер): да";

/** Текст для колонки «Доставка» в таблице. */
export function deliveryLabel(d: OrderDelivery): string {
  if (d.provider !== "cdek" || !d.cdek?.pickupPointCode) return d.label;
  const c = d.cdek;
  const parts = [`СДЭК ПВЗ ${c.pickupPointCode}`, [c.cityName, c.pickupPointAddress].filter(Boolean).join(", ")];
  /** «тариф СДЭК 441 ₽, в т. ч. страховка 26 ₽» */
  const tariff = (cost: number) =>
    `тариф СДЭК ${formatPrice(cost)}${c.insurance ? `, в т. ч. страховка ${formatPrice(c.insurance)}` : ""}`;
  if (c.abroad && c.price !== undefined && c.cost !== undefined) {
    // Заказ из-за рубежа: цены в долларах, оплата в рублях по курсу ЦБ
    parts.push(`$${c.abroad.deliveryUsd} = ${formatPrice(c.price)} (${tariff(c.cost)})`);
  } else if (c.price !== undefined && c.cost !== undefined) {
    if (c.price === 0) parts.push(`бесплатно для покупателя (${tariff(c.cost)})`);
    else if (c.price !== c.cost) parts.push(`${formatPrice(c.price)} (${tariff(c.cost)})`);
    else parts.push(formatPrice(c.price));
  } else if (c.cost !== undefined) parts.push(formatPrice(c.cost));
  if (c.periodMin && c.periodMax)
    parts.push(c.periodMin === c.periodMax ? `${c.periodMin} дн.` : `${c.periodMin}–${c.periodMax} дн.`);
  if (c.abroad)
    parts.push(
      `${c.abroad.kit ? "набор" : c.abroad.wholesale ? "мел (опт)" : "мел"} $${c.abroad.unitUsd}/шт., курс ${c.abroad.rate.toFixed(2)} ₽/$`,
    );
  if (c.trackingNumber) parts.push(`трек ${c.trackingNumber}`);
  return parts.filter(Boolean).join(" · ");
}

export interface CreateOrderOptions {
  meta?: Order["meta"];
  /** Доставка, уже рассчитанная на сервере (СДЭК) */
  delivery?: OrderDelivery;
  /** Сколько платит покупатель за доставку, ₽ */
  deliveryCost?: number;
  /** Цена 1 шт. (мела или набора), ₽, если отличается от обычной (заказ из-за рубежа — $ по курсу ЦБ) */
  unitPrice?: number;
  /** Сразу ждём онлайн-оплату */
  awaitingPayment?: boolean;
}

/** Собирает заказ из проверенной формы и сохраняет его. */
/** Собирает заказ (номер, суммы, доставка) без сохранения. */
export function buildOrder(input: OrderInput, opts: CreateOrderOptions = {}): Order {
  const isRu = input.region === "ru";
  const kit = input.product === "kit";
  const unitPrice = opts.unitPrice && opts.unitPrice > 0 ? opts.unitPrice : productPrice(input.product, input.quantity);
  // Первые строки комментария — то, что менеджеру важно увидеть сразу: набор с наклейкой, оптовая цена, ИИН / ПИН получателя
  const notes = [
    kit ? kitOrderNote(input.quantity, input.tip) : "",
    isWholesale(input.product, input.quantity) ? wholesaleOrderNote(formatPrice(unitPrice)) : "",
    input.taxId ? `${input.deliveryCountry === "KG" ? "ПИН" : "ИИН"} получателя: ${input.taxId}` : "",
    input.comment,
  ].filter(Boolean);
  const itemsTotal = unitPrice * input.quantity;
  const deliveryCost = Math.max(0, Math.ceil(opts.deliveryCost ?? 0));
  const order: Order = {
    id: generateOrderId(),
    createdAt: new Date().toISOString(),
    status: opts.awaitingPayment ? "awaiting_payment" : "new",
    region: input.region,
    customer: {
      name: input.name,
      phone: normalizePhone(input.phone, input.region) ?? input.phone,
      email: input.email,
      ...(input.taxId ? { taxId: input.taxId } : {}),
    },
    address: isRu
      ? { country: cdekCountry(input.deliveryCountry).name, city: cityWithCountry(input) }
      : { country: input.country, city: input.city, postalCode: input.postalCode, address: input.address },
    ...(kit ? { product: "kit" as const, tip: input.tip } : {}),
    quantity: input.quantity,
    ...(input.newsletter ? { newsletter: true as const } : {}),
    unitPrice,
    itemsTotal,
    deliveryCost,
    total: itemsTotal + deliveryCost,
    currency: "RUB",
    comment: notes.join("\n"),
    delivery:
      opts.delivery ??
      (isRu
        ? { provider: "cdek", label: "СДЭК — уточняется" }
        : { provider: "international", label: "Международная доставка — уточняется" }),
    meta: opts.meta,
    consents: { personalData: input.consent, orderEmails: input.newsletter, edition: SHOP.privacyEdition },
  };
  return order;
}

/** Собирает и сохраняет заказ. */
export async function createOrder(input: OrderInput, opts: CreateOrderOptions = {}): Promise<Order> {
  const order = buildOrder(input, opts);
  await saveOrder(order);
  return order;
}
