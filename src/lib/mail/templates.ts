/**
 * Письма покупателю: «Спасибо за заказ» (после оплаты), трек-номер СДЭК, напоминание о сроке хранения в пункте выдачи.
 * Простая вёрстка таблицами со встроенными стилями — так письмо одинаково выглядит в Gmail, Яндексе, Mail.ru и на телефоне.
 */
import { SELLER, SHOP, SITE } from "@/config/site";

/** Заказ в том виде, который нужен письмам */
export interface MailOrder {
  id: string;
  email: string;
  name: string;
  quantity: number;
  /** Сумма заказа, ₽ */
  total: number;
  /** Текст колонки «Доставка»: «СДЭК ПВЗ KRD12 · Краснодар, ул. Красная, 1 · …» */
  delivery: string;
  /** Подарочный набор: наклейка JOS */
  kit?: string;
}

export interface Mail {
  subject: string;
  text: string;
  html: string;
}

export const trackLink = (n: string) => `https://www.cdek.ru/ru/tracking/?order_id=${encodeURIComponent(n)}`;

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const rub = (n: number) => `${Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ")} ₽`;

const dayMonth = (d: Date) =>
  d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long" });

/** Адрес пункта выдачи из «Доставки»: «СДЭК ПВЗ KRD12 · Краснодар, ул. Красная, 1 · 455 ₽» → «Краснодар, ул. Красная, 1» */
export function pickupFrom(delivery: string): string {
  const parts = String(delivery || "").split(" · ");
  if (!/^СДЭК ПВЗ/.test(parts[0] ?? "") || !parts[1]) return "";
  return /₽|\$|трек|дн\.|⚠/.test(parts[1]) ? "" : parts[1];
}

export function itemsLine(o: MailOrder): string {
  const qty = Math.max(1, o.quantity || 1);
  return o.kit
    ? `Подарочный набор Kamui × Iosif Abramov (наклейка JOS ${o.kit}) — ${qty} шт.`
    : `Мел Kamui × Iosif Abramov 0.98 β — ${qty} шт.`;
}

const greeting = (o: MailOrder) => (o.name ? `Здравствуйте, ${o.name}!` : "Здравствуйте!");

const footerText = () =>
  ["Abramov Shop — официальный магазин мела Kamui × Iosif Abramov", SITE.domain, SELLER.name].join("\n");

function frame(inner: string): string {
  return (
    '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#f2f2f3">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f3"><tr><td align="center" style="padding:24px 12px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#141414">' +
    '<tr><td style="background:#111111;padding:18px 24px;color:#ffffff;font-size:15px;font-weight:bold;letter-spacing:1px">KAMUI <span style="color:#e3161b">×</span> IOSIF ABRAMOV</td></tr>' +
    `<tr><td style="padding:28px 24px 24px;font-size:16px;line-height:1.5">${inner}</td></tr>` +
    '<tr><td style="padding:16px 24px;border-top:1px solid #ececee;font-size:12px;line-height:1.5;color:#888">' +
    `Abramov Shop — официальный магазин мела Kamui × Iosif Abramov<br><a href="${esc(SITE.url)}" style="color:#888">${esc(SITE.domain)}</a> · ${esc(SELLER.name)}` +
    "</td></tr></table></td></tr></table></body></html>"
  );
}

const p = (html: string, style = "margin:0 0 14px") => `<p style="${style}">${html}</p>`;
const muted = "margin:0 0 10px;font-size:14px;color:#555";

const button = (href: string, label: string) =>
  `<a href="${esc(href)}" style="display:block;background:#e3161b;color:#ffffff;text-decoration:none;text-align:center;font-size:16px;font-weight:bold;padding:16px 20px;border-radius:8px">${esc(label)}</a>`;

const trackBox = (n: string) =>
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f7;border-radius:10px;margin:22px 0 16px"><tr><td style="padding:18px 20px">' +
  '<div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#777">Трек-номер СДЭК</div>' +
  `<div style="margin-top:6px;font-size:28px;font-weight:bold;letter-spacing:2px;color:#141414">${esc(n)}</div>` +
  "</td></tr></table>";

const join = (lines: string[]) =>
  lines.filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== "")).join("\n");

/** «Спасибо за заказ» — сразу после оплаты */
export function paidMail(o: MailOrder): Mail {
  const pickup = pickupFrom(o.delivery);
  const row = (label: string, value: string) =>
    value
      ? `<tr><td style="padding:6px 0;color:#777;font-size:14px;width:120px;vertical-align:top">${esc(label)}</td><td style="padding:6px 0;font-size:14px;color:#141414">${esc(value)}</td></tr>`
      : "";
  return {
    subject: `Спасибо за заказ ${o.id}! Оплата получена`,
    text: join([
      greeting(o),
      "",
      `Спасибо за заказ! Оплата заказа ${o.id} получена.`,
      itemsLine(o),
      o.total ? `Сумма: ${rub(o.total)}` : "",
      pickup ? `Пункт выдачи СДЭК: ${pickup}` : "",
      "",
      `Мы передадим посылку в СДЭК в течение ${SHOP.dispatchTime} и пришлём трек-номер отдельным письмом.`,
      "Кассовый чек приходит на эту почту от платёжного сервиса.",
      "",
      "Если есть вопросы по заказу — просто ответьте на это письмо.",
      "",
      footerText(),
    ]),
    html: frame(
      p(esc(greeting(o))) +
        p("Спасибо за заказ!", "margin:0 0 6px;font-size:22px;font-weight:bold") +
        p(`Оплата заказа <b>${esc(o.id)}</b> получена.`, "margin:0 0 16px") +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ececee;border-bottom:1px solid #ececee;margin:0 0 16px">' +
        row("Заказ", itemsLine(o)) +
        row("Сумма", o.total ? rub(o.total) : "") +
        row("Пункт выдачи", pickup ? `СДЭК, ${pickup}` : "") +
        "</table>" +
        p(
          `Мы передадим посылку в СДЭК в течение <span style="white-space:nowrap">${esc(SHOP.dispatchTime)}</span> и пришлём трек-номер отдельным письмом.`,
          "margin:0 0 10px;font-size:15px",
        ) +
        p("Кассовый чек приходит на эту почту от платёжного сервиса.", muted) +
        p("Если есть вопросы по заказу — просто ответьте на это письмо.", "margin:0;font-size:14px;color:#555"),
    ),
  };
}

/** Трек-номер СДЭК — как только он появился */
export function trackMail(o: MailOrder, track: string): Mail {
  const pickup = pickupFrom(o.delivery);
  return {
    subject: `Трек-номер СДЭК по заказу ${o.id}: ${track}`,
    text: join([
      greeting(o),
      "",
      `Ваш заказ ${o.id} оформлен к отправке службой доставки СДЭК.`,
      itemsLine(o),
      pickup ? `Пункт выдачи СДЭК: ${pickup}` : "",
      "",
      `Трек-номер: ${track}`,
      `Отследить посылку: ${trackLink(track)}`,
      "",
      "Статус в СДЭК обновится, когда посылка будет передана в службу доставки. Когда она прибудет в пункт выдачи, СДЭК пришлёт SMS.",
      "",
      "Если есть вопросы по заказу — просто ответьте на это письмо.",
      "",
      footerText(),
    ]),
    html: frame(
      p(esc(greeting(o))) +
        p(`Ваш заказ <b>${esc(o.id)}</b> оформлен к отправке службой доставки СДЭК.`) +
        p(esc(itemsLine(o)), "margin:0 0 6px;color:#555;font-size:14px") +
        (pickup ? p(`Пункт выдачи СДЭК: ${esc(pickup)}`, "margin:0 0 6px;color:#555;font-size:14px") : "") +
        trackBox(track) +
        button(trackLink(track), "Отследить посылку") +
        p(
          "Статус в СДЭК обновится, когда посылка будет передана в службу доставки. Когда она прибудет в пункт выдачи, СДЭК пришлёт SMS.",
          "margin:20px 0 10px;font-size:14px;color:#555",
        ) +
        p("Если есть вопросы по заказу — просто ответьте на это письмо.", "margin:0;font-size:14px;color:#555"),
    ),
  };
}

/** Посылка ждёт в пункте выдачи, срок хранения заканчивается */
export function storageMail(o: MailOrder, track: string, until: Date): Mail {
  const pickup = pickupFrom(o.delivery);
  const date = dayMonth(until);
  return {
    subject: `Заказ ${o.id} ждёт вас в пункте выдачи СДЭК до ${date}`,
    text: join([
      greeting(o),
      "",
      `Ваш заказ ${o.id} ждёт вас в пункте выдачи СДЭК${pickup ? `: ${pickup}` : ""}.`,
      `Срок хранения заканчивается ${date} — после этого посылка уедет обратно к нам.`,
      "",
      "Для получения понадобится код из SMS от СДЭК или паспорт.",
      `Трек-номер: ${track}`,
      `Статус посылки: ${trackLink(track)}`,
      "",
      "Не успеваете забрать? Ответьте на это письмо — постараемся продлить хранение.",
      "",
      footerText(),
    ]),
    html: frame(
      p(esc(greeting(o))) +
        p(
          `Ваш заказ <b>${esc(o.id)}</b> ждёт вас в пункте выдачи СДЭК${pickup ? `: ${esc(pickup)}` : ""}.`,
        ) +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff4c2;border-radius:10px;margin:8px 0 16px"><tr><td style="padding:16px 20px;font-size:16px;line-height:1.45">' +
        `Срок хранения заканчивается <b style="white-space:nowrap">${esc(date)}</b>. После этого посылка уедет обратно к нам.` +
        "</td></tr></table>" +
        p("Для получения понадобится код из SMS от СДЭК или паспорт.", muted) +
        trackBox(track) +
        button(trackLink(track), "Посмотреть статус посылки") +
        p("Не успеваете забрать? Ответьте на это письмо — постараемся продлить хранение.", "margin:20px 0 0;font-size:14px;color:#555"),
    ),
  };
}

/* ───────── Международные заказы (страны вне списка СДЭК): письма на английском и русском ───────── */

const lines = (s: string) => esc(s).replace(/\r?\n/g, "<br>");

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Сразу после заявки: «получили, менеджер проверит данные и пришлёт сумму и реквизиты» */
export function intlAckMail(o: MailOrder): Mail {
  const hi = o.name ? `Hello, ${o.name}!` : "Hello!";
  const hiRu = o.name ? `Здравствуйте, ${o.name}!` : "Здравствуйте!";
  return {
    subject: `We received your order request ${o.id} / Заявка ${o.id} принята`,
    text: join([
      hi,
      "",
      `Thank you! We have received your order request ${o.id}.`,
      itemsLine(o).replace(/— (\d+) шт\./, "— $1 pcs"),
      "",
      "Our manager will check your details and email you the total amount (shipping included, in US dollars) and payment instructions.",
      "Please do not pay until you receive that email.",
      "",
      "— — —",
      "",
      hiRu,
      "",
      `Спасибо! Заявка ${o.id} принята.`,
      "Менеджер проверит данные и пришлёт на эту почту итоговую сумму (с доставкой, в долларах США) и реквизиты для оплаты. До получения этого письма ничего оплачивать не нужно.",
      "",
      footerText(),
    ]),
    html: frame(
      p(esc(hi)) +
        p("We received your order request", "margin:0 0 6px;font-size:22px;font-weight:bold") +
        p(`Request <b>${esc(o.id)}</b> · ${esc(itemsLine(o).replace(/— (\d+) шт\./, "— $1 pcs"))}`, "margin:0 0 16px") +
        p("Our manager will check your details and email you the <b>total amount</b> (shipping included, in US dollars) and <b>payment instructions</b>. Please do not pay until you receive that email.", "margin:0 0 22px;font-size:15px") +
        '<div style="border-top:1px solid #ececee;padding-top:18px">' +
        p(esc(hiRu), "margin:0 0 8px;font-size:14px;color:#555") +
        p(`Заявка <b>${esc(o.id)}</b> принята. Менеджер проверит данные и пришлёт на эту почту итоговую сумму (с доставкой, в долларах США) и реквизиты для оплаты. До получения этого письма ничего оплачивать не нужно.`, "margin:0;font-size:14px;color:#555") +
        "</div>",
    ),
  };
}

/** После проверки менеджером: сумма в долларах (с доставкой) и куда переводить */
export function intlPayMail(o: MailOrder, amountUsd: number, details: string): Mail {
  const hi = o.name ? `Hello, ${o.name}!` : "Hello!";
  const hiRu = o.name ? `Здравствуйте, ${o.name}!` : "Здравствуйте!";
  const sum = usd(amountUsd);
  return {
    subject: `Payment for order ${o.id}: ${sum} / Оплата заказа ${o.id}: ${sum}`,
    text: join([
      hi,
      "",
      `We have checked your order ${o.id}. Thank you!`,
      `Total to pay: ${sum} (shipping included).`,
      "",
      "How to pay:",
      details,
      "",
      `Your order number is ${o.id}. You do not have to write it in the payment comment.`,
      "IMPORTANT: after paying, reply to this email with the payment receipt (screenshot or PDF). Without the receipt we cannot process your order.",
      "",
      "Please also reply with your delivery details, in Latin letters only:",
      "1. Full name",
      "2. City / locality",
      "3. Postal code",
      "4. Phone number",
      "",
      "We will ship the parcel after the payment is confirmed.",
      "",
      "— — —",
      "",
      hiRu,
      "",
      `Мы проверили ваш заказ ${o.id}. Спасибо!`,
      `Сумма к оплате: ${sum} (с доставкой).`,
      "",
      "Реквизиты для оплаты — выше. Номер заказа в комментарии к переводу писать необязательно.",
      "ВАЖНО: после оплаты ответьте на это письмо и приложите чек об оплате (скриншот или PDF). Без чека оформить заказ не получится.",
      "",
      "Также в ответном письме укажите данные для доставки, всё латиницей:",
      "1. ФИО",
      "2. Населённый пункт",
      "3. Индекс",
      "4. Телефон",
      "",
      "Отправим посылку после подтверждения оплаты.",
      "",
      footerText(),
    ]),
    html: frame(
      p(esc(hi)) +
        p(`We have checked your order <b>${esc(o.id)}</b>. Thank you!`, "margin:0 0 16px") +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f7;border-radius:10px;margin:0 0 16px"><tr><td style="padding:18px 20px">' +
        '<div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#777">Total to pay · К оплате</div>' +
        `<div style="margin-top:6px;font-size:30px;font-weight:bold;color:#141414">${esc(sum)}</div>` +
        '<div style="margin-top:2px;font-size:13px;color:#777">shipping included · с доставкой</div>' +
        "</td></tr></table>" +
        p("How to pay · Как оплатить", "margin:0 0 6px;font-size:14px;font-weight:bold") +
        `<div style="margin:0 0 16px;padding:14px 16px;border:1px solid #ececee;border-radius:8px;font-size:15px;line-height:1.55">${lines(details)}</div>` +
        p(`Your order number is <b>${esc(o.id)}</b>. You do not have to write it in the payment comment.`, "margin:0 0 12px;font-size:14px;color:#555") +
        '<div style="margin:0 0 16px;padding:14px 16px;background:#fff4f4;border-left:4px solid #e3161b;border-radius:6px;font-size:15px;line-height:1.55"><b>Important:</b> after paying, reply to this email with the <b>payment receipt</b> (screenshot or PDF). Without the receipt we cannot process your order.</div>' +
        p("Please also reply with your delivery details, <b>in Latin letters only</b>:", "margin:0 0 6px;font-size:14px") +
        '<ol style="margin:0 0 14px;padding-left:22px;font-size:14px;line-height:1.7"><li>Full name</li><li>City / locality</li><li>Postal code</li><li>Phone number</li></ol>' +
        p("We will ship the parcel after the payment is confirmed.", "margin:0 0 18px;font-size:14px;color:#555") +
        '<div style="border-top:1px solid #ececee;padding-top:16px">' +
        p(esc(hiRu), "margin:0 0 6px;font-size:14px;color:#555") +
        p(`Заказ <b>${esc(o.id)}</b> проверен. Реквизиты — выше. Номер заказа в комментарии к переводу писать необязательно.`, "margin:0 0 8px;font-size:14px;color:#555") +
        p("<b>Важно:</b> после оплаты ответьте на это письмо и приложите <b>чек об оплате</b> (скриншот или PDF). Без чека оформить заказ не получится.", "margin:0 0 8px;font-size:14px;color:#555") +
        p("Также укажите данные для доставки, <b>всё латиницей</b>: ФИО, населённый пункт, индекс, телефон. Отправим посылку после подтверждения оплаты.", "margin:0;font-size:14px;color:#555") +
        "</div>",
    ),
  };
}


/** Как пользоваться мелом — отдельным письмом после письма с трек-номером */
export function usageMail(o: MailOrder): Mail {
  const steps = [
    "Наносите мел нежно, без нажима. Если давить, он начинает крошиться и пылить.",
    "На наклейку хватает двух-трёх, максимум четырёх слоёв — аккуратно, лёгкими движениями.",
    "Этого достаточно на 15–20 ударов без киксов, сцепка при этом стабильная.",
    "Не добавляйте мел поверх лишнего: если его слишком много, остаётся заметный след на шаре.",
  ];
  const note = "Любой мел оставляет след на шаре. Если следа много — значит, мела нанесено больше, чем нужно: достаточно тонкого слоя.";
  return {
    subject: "Как пользоваться мелом Kamui × Iosif Abramov",
    text: join([
      greeting(o),
      "",
      "Несколько советов, чтобы мел работал так, как задумано:",
      "",
      ...steps.map((t, i) => `${i + 1}. ${t}`),
      "",
      note,
      "",
      "Если появятся вопросы — просто ответьте на это письмо.",
      "",
      "С уважением,",
      "Abramov Shop",
      "",
      footerText(),
    ]),
    html: frame(
      p(esc(greeting(o))) +
        p("Как пользоваться мелом", "margin:0 0 6px;font-size:22px;font-weight:bold") +
        p("Несколько советов, чтобы мел работал так, как задумано:", "margin:0 0 12px;font-size:15px") +
        `<ol style="margin:0 0 16px;padding-left:22px;font-size:15px;line-height:1.7">${steps.map((t) => `<li style="margin:0 0 6px">${esc(t)}</li>`).join("")}</ol>` +
        p(esc(note), "margin:0 0 16px;font-size:14px;color:#555") +
        p("Если появятся вопросы — просто ответьте на это письмо.", "margin:0 0 14px;font-size:14px;color:#555") +
        p("С уважением,<br>Abramov Shop", "margin:0;font-size:15px"),
    ),
  };
}
