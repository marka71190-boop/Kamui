/**
 * POST /api/orders — приём заявки.
 * Проверяет форму и остаток, при подключённом СДЭК заново рассчитывает доставку до выбранного ПВЗ,
 * создаёт номер заказа, сохраняет заявку (локальный файл + Google Таблица)
 * и, если включена ЮKassa, создаёт платёж и возвращает ссылку на оплату.
 *
 * Скорость: остаток берётся из кэша (не ждём таблицу), остаток и СДЭК считаются параллельно,
 * запись в таблицу и создание платежа идут одновременно, а номер платежа дописывается в таблицу
 * уже после ответа покупателю.
 */
import { after } from "next/server";
import { features } from "@/config/features";
import { isWholesale, priceFor, productPrice } from "@/config/products";
import { PRODUCT } from "@/config/site";
import { calculateDelivery, findPickupPoint } from "@/lib/delivery/cdek";
import { customerDeliveryPrice } from "@/lib/delivery/price";
import { clientIp, createRateLimiter, json } from "@/lib/http";
import { buildOrder, cityWithCountry, deliveryLabel } from "@/lib/orders/create";
import { OrderStorageError, saveOrder, updateOrder } from "@/lib/orders/store";
import type { OrderDelivery } from "@/lib/orders/types";
import { notifyIntlAck, quietly } from "@/lib/mail/notify";
import { emailDomainVerdict, EMAIL_VERDICT_TEXT } from "@/lib/orders/email-dns";
import { normalizeOrderInput, validateOrderInput, type OrderInput } from "@/lib/orders/validation";
import { createRobokassaPayment } from "@/lib/payments/robokassa";
import { createPayment, siteOriginFor } from "@/lib/payments/yookassa";
import { abroadUnitUsd, deliveryUsdFor, getAbroadPricing, getUsdPrice, usdToRub } from "@/lib/currency";
import { getStock } from "@/lib/stock";

export const runtime = "nodejs";
// Без force-dynamic: так остаток из таблицы берётся из кэша данных (обновляется раз в минуту), а не ждёт ответа таблицы.
// Google Apps Script иногда отвечает несколько секунд — даём функции запас по времени.
export const maxDuration = 60;

const rateLimit = createRateLimiter({ limit: 5, windowMs: 10 * 60 * 1000 });
/** Результат промиса или null, если он не успел за ms миллисекунд (или упал). */
function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((r) => (timer = setTimeout(() => r(null), ms)));
  return Promise.race([p.catch(() => null), timeout]).finally(() => clearTimeout(timer));
}

type DeliveryResult =
  | { ok: true; delivery: OrderDelivery; cost: number }
  | { ok: false; error: string; field?: "city" | "pickupPoint" }
  | { ok: "unavailable"; delivery: OrderDelivery };

/** Доставка СДЭК до ПВЗ: проверяем пункт и считаем цену на сервере (цене из браузера не доверяем). */
async function resolveCdekDelivery(input: OrderInput, unitPrice: number): Promise<DeliveryResult> {
  try {
    const [point, quote] = await Promise.all([
      findPickupPoint(input.cityCode, input.pickupPoint),
      // Объявленная стоимость = стоимость товаров в заказе (как в накладной) — от неё СДЭК считает страховку
      calculateDelivery({
        toCityCode: input.cityCode,
        quantity: input.quantity,
        product: input.product,
        declaredValue: unitPrice * input.quantity,
      }),
    ]);
    if (!point) return { ok: false, error: "Этот пункт выдачи сейчас недоступен — выберите другой", field: "pickupPoint" };
    // Пункт должен быть в той стране, которую покупатель выбрал в форме
    if (point.countryCode && point.countryCode !== input.deliveryCountry)
      return { ok: false, error: "Этот город в другой стране — проверьте страну доставки и выберите город заново", field: "city" };
    const price = customerDeliveryPrice(quote.cost);
    const delivery: OrderDelivery = {
      provider: "cdek",
      label: "",
      cdek: {
        countryCode: input.deliveryCountry,
        cityCode: input.cityCode,
        cityName: cityWithCountry(input),
        pickupPointCode: point.code,
        pickupPointAddress: point.address,
        tariffCode: quote.tariffCode,
        cost: quote.cost,
        ...(quote.insurance ? { insurance: quote.insurance } : {}),
        price,
        periodMin: quote.periodMin,
        periodMax: quote.periodMax,
      },
    };
    delivery.label = deliveryLabel(delivery);
    return { ok: true, delivery, cost: price };
  } catch (err) {
    // СДЭК не отвечает — заявку всё равно принимаем, менеджер уточнит доставку.
    console.error("[orders] СДЭК недоступен:", err);
    return {
      ok: "unavailable",
      delivery: {
        provider: "cdek",
        label: `СДЭК ПВЗ ${input.pickupPoint} · ${cityWithCountry(input)} · стоимость не рассчитана`,
        cdek: {
          countryCode: input.deliveryCountry,
          cityCode: input.cityCode,
          cityName: cityWithCountry(input),
          pickupPointCode: input.pickupPoint,
        },
      },
    };
  }
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  const limited = rateLimit(ip);
  if (!limited.ok) {
    return json({ ok: false, error: "Слишком много заявок подряд. Попробуйте через несколько минут. / Too many requests, please try again in a few minutes." }, 429, {
      "Retry-After": String(limited.retryAfter),
    });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, error: "Некорректный запрос" }, 400);
  }

  const input = normalizeOrderInput(raw);

  // Бот заполнил скрытое поле — ничего не сохраняем. Ответ честный (не «успех»):
  // автозаполнение браузера иногда заполняет скрытые поля у живых людей.
  if (input.trap) {
    return json({ ok: false, error: input.lang === "en" ? "Could not send the order. Please reload the page and try again." : "Не удалось отправить заказ. Обновите страницу и попробуйте снова." }, 400);
  }

  const useCdek = features.cdek && input.region === "ru";
  const formError = input.lang === "en" ? "Please check the form" : "Проверьте поля формы";

  // 1. Поля формы — сразу, без внешних запросов
  const testToken = process.env.PAYMENTS_TEST_TOKEN ?? "";
  const hasTestToken = testToken.length >= 8 && input.payTest === testToken;
  const countries = !useCdek ? ["RU"] : hasTestToken ? features.cdekCountries : features.publicCdekCountries;
  const fieldErrors = validateOrderInput(input, { maxQuantity: PRODUCT.maxPerOrder, requirePickupPoint: useCdek, countries });
  if (Object.keys(fieldErrors).length > 0) return json({ ok: false, error: formError, fieldErrors }, 400);

  // Почта: у домена должна быть почта (иначе письмо с оплатой и треком никогда не дойдёт)
  const verdict = await emailDomainVerdict(input.email);
  if (verdict !== "ok") return json({ ok: false, error: formError, fieldErrors: { email: EMAIL_VERDICT_TEXT[input.lang === "en" ? "en" : "ru"][verdict] } }, 400);

  // 2. Остаток, доставка СДЭК и курс доллара — параллельно.
  //    Остаток — из кэша; если таблица долго не отвечает, не держим покупателя дольше 2 секунд.
  // Заказ из-за рубежа с оплатой через Robokassa: цены в долларах, к оплате — рубли по курсу ЦБ
  const useRobokassa = input.region === "ru" && input.deliveryCountry !== "RU" && features.robokassa;
  const kit = input.product === "kit";
  /** Мел от 10 шт. — по оптовой цене */
  const wholesale = isWholesale(input.product, input.quantity);
  const abroadPricing = useRobokassa ? getAbroadPricing() : Promise.resolve(null);
  const [stock, cdek, usd, abroad] = await Promise.all([
    within(getStock(), 2_000),
    // Цена 1 шт. в рублях — для объявленной стоимости (из-за рубежа — $ по курсу ЦБ)
    useCdek
      ? abroadPricing.then((a) =>
          resolveCdekDelivery(
            input,
            a ? usdToRub(abroadUnitUsd(a, input.product, input.quantity), a.rate) : productPrice(input.product, input.quantity),
          ),
        )
      : Promise.resolve(null),
    input.lang === "en" ? getUsdPrice() : Promise.resolve(null),
    abroadPricing,
  ]);
  if (stock) {
    const errors = validateOrderInput(input, {
      maxQuantity: Math.min(PRODUCT.maxPerOrder, stock.remaining),
      requirePickupPoint: useCdek,
      countries,
    });
    if (Object.keys(errors).length > 0) {
      const status = errors.quantity && stock.remaining < input.quantity ? 409 : 400;
      return json({ ok: false, error: formError, fieldErrors: errors }, status);
    }
  }

  let delivery: OrderDelivery | undefined;
  let deliveryCost = 0;
  let deliveryKnown = true;
  let unitPrice: number | undefined;
  if (usd) {
    // Заказ с английской версии: цена показывалась в долларах — фиксируем её в таблице
    const unitUsd = priceFor(input.product, input.quantity, usd);
    delivery = {
      provider: "international",
      label: `Международная доставка — уточняется · англ. версия сайта: ${kit ? "набор " : wholesale ? "опт " : ""}$${unitUsd}/шт., итого $${unitUsd * input.quantity}${
        usd.rate ? ` (курс ${usd.rate.toFixed(2)} ₽/$)` : ""
      }`,
    };
  }
  if (cdek) {
    const r = cdek;
    if (r.ok === false) {
      return json({ ok: false, error: r.error, fieldErrors: r.field ? { [r.field]: r.error } : undefined }, 400);
    }
    delivery = r.delivery;
    if (r.ok === true) deliveryCost = r.cost;
    else deliveryKnown = false;
  }

  if (abroad && delivery?.cdek && deliveryKnown) {
    // Мел — по цене в долларах, доставка — цена СДЭК для покупателя + надбавка на комиссию Robokassa, в целых долларах;
    // всё пересчитывается в рубли по курсу ЦБ (Robokassa принимает оплату в рублях)
    const deliveryUsd = deliveryUsdFor(deliveryCost, abroad);
    const unitUsd = abroadUnitUsd(abroad, input.product, input.quantity);
    unitPrice = usdToRub(unitUsd, abroad.rate);
    deliveryCost = usdToRub(deliveryUsd, abroad.rate);
    delivery = {
      ...delivery,
      cdek: {
        ...delivery.cdek,
        price: deliveryCost,
        abroad: { unitUsd, deliveryUsd, rate: abroad.rate, ...(kit ? { kit: true } : {}), ...(wholesale ? { wholesale: true } : {}) },
      },
    };
    delivery.label = deliveryLabel(delivery);
  }

  // Онлайн-оплата — для доставки СДЭК и только когда сумма доставки известна.
  // По России — ЮKassa; в Беларусь, Казахстан, Армению и Кыргызстан — Robokassa (карты зарубежных банков),
  // если она подключена, иначе тоже ЮKassa. Заявки в другие страны — без оплаты, менеджеру.
  // Тестовый магазин ЮKassa — оплата только для того, кто открыл сайт по секретной ссылке.
  const paymentsHere = useRobokassa
    ? true
    : features.payments &&
      input.region === "ru" &&
      (!features.paymentsTestShop || hasTestToken);
  const payOnline = paymentsHere && deliveryKnown;

  try {
    const order = buildOrder(input, {
      meta: { ip, userAgent: request.headers.get("user-agent")?.slice(0, 200) ?? undefined },
      delivery,
      deliveryCost,
      unitPrice,
      awaitingPayment: payOnline,
    });

    if (payOnline && useRobokassa) {
      // Ссылка Robokassa подписывается на месте, без запроса к Robokassa. Сначала сохраняем заказ —
      // без строки в таблице оплату не предлагаем (её нечем будет отметить).
      await saveOrder(order);
      try {
        const payment = createRobokassaPayment(order);
        // Номер счёта — в таблицу (не с «Robokassa…» в начале: так помечаются только оплаченные)
        after(() =>
          updateOrder(order.id, {
            payment: {
              provider: "robokassa",
              paymentId: payment.paymentId,
              status: "pending",
              test: payment.test || undefined,
              label: `${payment.test ? "ТЕСТ · " : ""}ожидает оплаты · Robokassa · счёт ${payment.invoiceId}`,
            },
          }),
        );
        return json(
          {
            ok: true,
            orderId: order.id,
            total: order.total,
            provider: "robokassa",
            paymentId: payment.paymentId,
            paymentUrl: payment.url,
            paymentForm: payment.form,
          },
          201,
        );
      } catch (err) {
        console.error(`[orders] Не удалось подготовить оплату Robokassa для ${order.id}:`, err);
        after(() => updateOrder(order.id, { status: "new" }));
        return json({ ok: true, orderId: order.id, total: order.total, paymentUnavailable: true }, 201);
      }
    }

    if (payOnline) {
      // Запись в таблицу и платёж — одновременно. Не сохранилась заявка — платёж просто истечёт неоплаченным.
      const [saved, pay] = await Promise.allSettled([
        saveOrder(order),
        createPayment(order, { origin: siteOriginFor(request) }),
      ]);
      if (saved.status === "rejected") throw saved.reason;
      if (pay.status === "fulfilled") {
        const payment = pay.value;
        // Номер платежа дописываем в таблицу уже после ответа — покупатель сразу уходит на оплату
        after(() =>
          updateOrder(order.id, {
            payment: {
              provider: "yookassa",
              paymentId: payment.paymentId,
              status: payment.status,
              confirmationUrl: payment.confirmationUrl,
              test: payment.test || undefined,
            },
          }),
        );
        return json(
          { ok: true, orderId: order.id, total: order.total, paymentId: payment.paymentId, paymentUrl: payment.confirmationUrl },
          201,
        );
      }
      // Заявка уже сохранена — менеджер свяжется и выставит оплату вручную.
      console.error(`[orders] Не удалось создать платёж для ${order.id}:`, pay.reason);
      after(() => updateOrder(order.id, { status: "new" }));
      return json({ ok: true, orderId: order.id, total: order.total, paymentUnavailable: true }, 201);
    }

    await saveOrder(order);
    // Международная заявка: сразу письмо «принято, менеджер проверит данные и пришлёт сумму и реквизиты»
    if (input.region === "intl" && !paymentsHere) {
      after(() =>
        quietly(
          notifyIntlAck({
            id: order.id,
            email: order.customer.email,
            name: order.customer.name,
            quantity: order.quantity,
            total: order.total,
            delivery: "",
            ...(order.product === "kit" ? { kit: order.tip } : {}),
          }),
        ),
      );
    }
    return json(
      {
        ok: true,
        orderId: order.id,
        total: order.total,
        ...(paymentsHere ? { paymentUnavailable: true } : {}),
      },
      201,
    );
  } catch (err) {
    if (!(err instanceof OrderStorageError)) console.error("[orders] Ошибка:", err);
    return json(
      {
        ok: false,
        error:
          input.lang === "en"
            ? "Could not send the request. Please try again in a minute."
            : "Не удалось отправить заявку. Попробуйте ещё раз через минуту.",
      },
      500,
    );
  }
}
