/**
 * Kamui Collection — приём заявок с сайта в Google Таблицу.
 *
 * Установка (подробно — в README.md, раздел «Google Таблица заказов»):
 *   1. Создайте таблицу, откройте Расширения → Apps Script, вставьте этот код.
 *   2. Замените SECRET на свою длинную случайную строку (та же — в GOOGLE_SHEETS_SECRET на сайте).
 *   3. Выберите функцию setup и нажмите «Выполнить» — создадутся листы и заголовки.
 *   4. Начать развёртывание → Новое развёртывание → Веб-приложение:
 *      «Запуск от имени: Я», «Доступ: Все». Скопируйте URL в GOOGLE_SHEETS_WEBHOOK_URL.
 */

const SECRET = "ЗАМЕНИТЕ-НА-ДЛИННУЮ-СЛУЧАЙНУЮ-СТРОКУ";

/** Email для уведомлений о новых заявках (необязательно). Пример: 'shop@example.ru' */
const NOTIFY_EMAIL = "";

const SPREADSHEET_TITLE = "Kamui Collection — Заказы";
const SHEET_RU = "Заказы";
const SHEET_INTL = "Международные заказы";
const SHEET_SETTINGS = "Настройки";
/** Колонка с отметками о письмах покупателю: «оплата 23.10.2026 14:30», «трек 1234567890 …», «хранение …» */
const MAIL_HEADER = "Письма покупателю";

/** Журнал согласий из формы заказа: кто, когда, с какого IP и на что согласился */
const SHEET_CONSENTS = "Согласия";

const COLUMNS_CONSENTS = [
  ["Дата и время", "createdAt"],
  ["ID заказа", "id"],
  ["ФИО", "name"],
  ["Email", "email"],
  ["Телефон", "phone"],
  ["Согласие на обработку ПДн", "personalData"],
  ["Текст согласия", "document"],
  ["Письма о заказе (трек-номер)", "orderEmails"],
  ["IP", "ip"],
  ["Браузер", "userAgent"],
];

// Колонки: [заголовок, ключ в данных с сайта]
const COLUMNS_RU = [
  ["ID заказа", "id"],
  ["Дата", "createdAt"],
  ["Статус", "status"],
  ["Имя", "name"],
  ["Телефон", "phone"],
  ["Email", "email"],
  ["Количество", "quantity"],
  ["Сумма", "total"],
  ["Город", "city"],
  ["Доставка", "delivery"],
  ["Комментарий", "comment"],
  ["Платёж", "payment"],
];

const COLUMNS_INTL = [
  ["ID заказа", "id"],
  ["Дата", "createdAt"],
  ["Статус", "status"],
  ["Имя", "name"],
  ["Телефон", "phone"],
  ["Email", "email"],
  ["Количество", "quantity"],
  ["Сумма", "total"],
  ["Страна", "country"],
  ["Город", "city"],
  ["Индекс", "postalCode"],
  ["Адрес", "address"],
  ["Доставка", "delivery"],
  ["Комментарий", "comment"],
  ["Платёж", "payment"],
];

const STATUSES = ["Новая", "Ожидает оплаты", "Оплачена", "Оплата отменена", "Отправлена", "Доставлена", "Отменена"];

/** Запустите один раз вручную: создаёт листы, заголовки, оформление и настройки остатка. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.rename(SPREADSHEET_TITLE);
  ss.setSpreadsheetTimeZone("Europe/Moscow");
  ensureOrdersSheet_(ss, SHEET_RU, COLUMNS_RU);
  ensureOrdersSheet_(ss, SHEET_INTL, COLUMNS_INTL);
  ensureSettingsSheet_(ss);
  ensureConsentsSheet_(ss);
  const first = ss.getSheets()[0];
  if (first.getName() !== SHEET_RU && first.getLastRow() === 0) ss.deleteSheet(first);
}

function ensureOrdersSheet_(ss, name, columns) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    const headers = columns.map(function (c) {
      return c[0];
    });
    sh.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setFontWeight("bold")
      .setBackground("#111111")
      .setFontColor("#ffffff");
    sh.setFrozenRows(1);
    sh.setColumnWidths(1, headers.length, 140);
    sh.setColumnWidth(
      columns.findIndex(function (c) {
        return c[1] === "comment";
      }) + 1,
      280,
    );
    // Выпадающий список статусов
    const statusCol =
      columns.findIndex(function (c) {
        return c[1] === "status";
      }) + 1;
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(true).build();
    sh.getRange(2, statusCol, sh.getMaxRows() - 1, 1).setDataValidation(rule);
  }
  return sh;
}

function ensureSettingsSheet_(ss) {
  let sh = ss.getSheetByName(SHEET_SETTINGS);
  if (sh) return sh;
  sh = ss.insertSheet(SHEET_SETTINGS);
  sh.getRange("A1:C4").setValues([
    ["Параметр", "Значение", "Описание"],
    ["TOTAL_STOCK", 2000, "Всего выпущено экземпляров"],
    ["SOLD_COUNT", 49, "Продано вне сайта — оплаченные на сайте заказы сайт вычитает сам"],
    ["Осталось без онлайн-продаж", "=B2-B3", "TOTAL_STOCK − SOLD_COUNT; на сайте из этого ещё вычитаются оплаченные заказы"],
  ]);
  sh.getRange("A1:C1").setFontWeight("bold").setBackground("#111111").setFontColor("#ffffff");
  sh.setColumnWidth(1, 160);
  sh.setColumnWidth(3, 460);
  return sh;
}

function ensureConsentsSheet_(ss) {
  let sh = ss.getSheetByName(SHEET_CONSENTS);
  if (sh) return sh;
  sh = ss.insertSheet(SHEET_CONSENTS);
  sh.getRange(1, 1, 1, COLUMNS_CONSENTS.length)
    .setValues([
      COLUMNS_CONSENTS.map(function (c) {
        return c[0];
      }),
    ])
    .setFontWeight("bold")
    .setBackground("#111111")
    .setFontColor("#ffffff");
  sh.setFrozenRows(1);
  sh.setColumnWidths(1, COLUMNS_CONSENTS.length, 150);
  sh.setColumnWidth(7, 420);
  return sh;
}

/** Строка в журнал согласий (лист «Согласия»): пишется вместе с заказом */
function logConsents_(ss, c) {
  const sh = ensureConsentsSheet_(ss);
  const r = sh.getLastRow() + 1;
  const values = COLUMNS_CONSENTS.map(function (col) {
    const v = c[col[1]];
    if (col[1] === "createdAt") return v ? new Date(v) : new Date();
    return safeText_(v);
  });
  sh.getRange(r, 1, 1, values.length).setNumberFormat("@");
  sh.getRange(r, 1).setNumberFormat("dd.MM.yyyy HH:mm:ss");
  sh.getRange(r, 1, 1, values.length).setValues([values]);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return json_({ ok: false, error: "unauthorized" });
    // письмо покупателю — без блокировки таблицы
    if (body.action === "sendMail") return json_(sendMail_(body.mail || {}));

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      if (body.action === "createOrder") return json_(createOrder_(ss, body));
      if (body.action === "updateOrder") return json_(updateOrder_(ss, body));
      return json_({ ok: false, error: "unknown action" });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/**
 * Письмо покупателю от имени магазина (если сайт не может отправить его сам — хостинг закрыл почтовые порты).
 * Уходит из Gmail владельца таблицы от имени адреса магазина. Этот адрес должен быть добавлен
 * в Gmail → Настройки → Аккаунты и импорт → «Отправлять письма как» (у вас: shop@abramov.shop).
 * Чтобы разрешить скрипту отправку, один раз выполните функцию checkMail.
 */
function sendMail_(m) {
  const to = String(m.to || "").trim();
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(to) || !m.subject) return { ok: false, error: "нет адреса или темы письма" };
  const from = String(m.from || "").trim().toLowerCase();
  const aliases = GmailApp.getAliases().map(function (a) {
    return String(a).toLowerCase();
  });
  // от личного адреса Gmail покупателям не пишем — только от адреса магазина
  if (!from || aliases.indexOf(from) < 0) {
    return {
      ok: false,
      error: "адрес " + (from || "магазина") + " не добавлен в Gmail «Отправлять письма как»" + (aliases.length ? " (есть: " + aliases.join(", ") + ")" : ""),
    };
  }
  GmailApp.sendEmail(to, String(m.subject), String(m.text || ""), {
    htmlBody: m.html ? String(m.html) : undefined,
    from: from,
    name: String(m.fromName || "Abramov Shop"),
    replyTo: String(m.replyTo || from),
  });
  return { ok: true, left: MailApp.getRemainingDailyQuota() };
}

/** Выполните один раз вручную: Google спросит разрешение на отправку писем и покажет, с каких адресов можно писать */
function checkMail() {
  const aliases = GmailApp.getAliases();
  Logger.log("Адреса «Отправлять письма как»: " + (aliases.length ? aliases.join(", ") : "нет — добавьте shop@abramov.shop в настройках Gmail"));
  Logger.log("Можно отправить писем сегодня: " + MailApp.getRemainingDailyQuota());
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.secret !== SECRET) return json_({ ok: false, error: "unauthorized" });
  if (p.action === "stock") {
    const sh = ensureSettingsSheet_(SpreadsheetApp.getActiveSpreadsheet());
    return json_({
      ok: true,
      totalStock: Number(sh.getRange("B2").getValue()),
      soldCount: Number(sh.getRange("B3").getValue()),
    });
  }
  if (p.action === "paidOrders") {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const days = Number(p.days) || 30;
    const res = { ok: true, orders: paidOrders_(ss, days) };
    // для страницы накладных: заказы, ждущие оплаты в Robokassa, и международные заказы
    if (p.extra === "1") {
      res.awaiting = awaitingOrders_(ss, Math.min(days, 14));
      res.intl = intlOrders_(ss, days);
    }
    return json_(res);
  }
  return json_({ ok: true, service: "kamui-orders" });
}

/**
 * Заказы для служебной страницы накладных СДЭК. Колонки ищутся по заголовкам.
 *   paidOrders_     — оплаченные заказы листа «Заказы» (СДЭК, в т. ч. из-за рубежа через Robokassa);
 *   awaitingOrders_ — заказы «Ожидает оплаты» со счётом Robokassa: сайт сверяет их с Robokassa,
 *                     если уведомление об оплате до него не дошло;
 *   intlOrders_     — лист «Международные заказы» (доставка не СДЭК, оформляется вручную).
 */
function readOrders_(ss, sheetName, days, statuses) {
  const sh = ss.getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return [];
  const lastCol = sh.getLastColumn();
  const head = sh
    .getRange(1, 1, 1, lastCol)
    .getDisplayValues()[0]
    .map(function (h) {
      return String(h).trim();
    });
  const raw = sh.getRange(2, 1, sh.getLastRow() - 1, lastCol).getValues();
  const shown = sh.getRange(2, 1, sh.getLastRow() - 1, lastCol).getDisplayValues();
  const col = function (name) {
    return head.indexOf(name);
  };
  // номер заказа: «ID заказа» или колонка с номерами вида KA-261022-QUJE (если лист стал «Таблицей» Google)
  let idCol = col("ID заказа");
  if (idCol < 0) {
    for (let c = 0; c < lastCol && idCol < 0; c++) {
      for (let r = 0; r < Math.min(shown.length, 5) && idCol < 0; r++) {
        if (/^KA-\d{6}-[A-Z0-9]{4}$/.test(String(shown[r][c]).trim())) idCol = c;
      }
    }
  }
  const c = { date: col("Дата"), status: col("Статус"), name: col("Имя"), phone: col("Телефон"), email: col("Email"), qty: col("Количество"), total: col("Сумма"), country: col("Страна"), city: col("Город"), address: col("Адрес"), delivery: col("Доставка"), comment: col("Комментарий"), payment: col("Платёж") };
  // отметки о письмах: колонка сайта + отметки старого скрипта писем («Письмо с треком», «Письмо о заказе»)
  const mailCol = col(MAIL_HEADER);
  const oldTrackCol = col("Письмо с треком");
  const oldPaidCol = col("Письмо о заказе");
  if (idCol < 0 || c.status < 0) return [];
  const since = Date.now() - Math.min(90, Math.max(1, days)) * 24 * 3600 * 1000;
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const status = String(shown[i][c.status]).trim();
    if (statuses.indexOf(status) < 0) continue;
    const id = String(shown[i][idCol]).trim();
    if (!id) continue;
    const d = c.date >= 0 ? raw[i][c.date] : "";
    const at = d && typeof d.getTime === "function" ? d.getTime() : 0;
    if (at && at < since) continue;
    const get = function (k) {
      return c[k] >= 0 ? String(shown[i][c[k]]).trim() : "";
    };
    const city = get("city");
    const country = get("country");
    out.push({
      id: id,
      createdAt: at ? new Date(at).toISOString() : "",
      status: status,
      name: get("name"),
      phone: get("phone"),
      email: get("email"),
      quantity: c.qty >= 0 ? Number(raw[i][c.qty]) || 0 : 0,
      total: c.total >= 0 ? Number(raw[i][c.total]) || 0 : 0,
      city: country ? [country, city, get("address")].filter(String).join(", ") : city,
      delivery: get("delivery"),
      comment: get("comment"),
      payment: get("payment"),
      mailMarks: [
        mailCol >= 0 ? String(shown[i][mailCol]) : "",
        oldTrackCol >= 0 && /^отправлено/.test(String(shown[i][oldTrackCol])) ? String(shown[i][oldTrackCol]) : "",
        oldPaidCol >= 0 && /^отправлено/.test(String(shown[i][oldPaidCol])) ? "оплата " + String(shown[i][oldPaidCol]) : "",
      ]
        .filter(String)
        .join("\n"),
    });
  }
  return out;
}

function paidOrders_(ss, days) {
  return readOrders_(ss, SHEET_RU, days, ["Оплачена", "Отправлена", "Доставлена"]);
}

function awaitingOrders_(ss, days) {
  return readOrders_(ss, SHEET_RU, days, ["Ожидает оплаты", "Новая"]).filter(function (o) {
    return /Robokassa.*сч[её]т\s*\d+/.test(o.payment);
  });
}

function intlOrders_(ss, days) {
  return readOrders_(ss, SHEET_INTL, days, ["Новая", "Ожидает оплаты", "Оплачена", "Отправлена", "Доставлена"]);
}

function createOrder_(ss, body) {
  const isIntl = body.sheet === "intl";
  const columns = isIntl ? COLUMNS_INTL : COLUMNS_RU;
  const sh = ensureOrdersSheet_(ss, isIntl ? SHEET_INTL : SHEET_RU, columns);
  const row = body.row || {};

  // Защита от повторной записи одного и того же заказа
  if (findRow_(sh, row.id) > 0) return { ok: true, duplicate: true };

  const values = columns.map(function (c) {
    const key = c[1];
    const v = row[key];
    if (key === "createdAt") return v ? new Date(v) : new Date();
    if (key === "quantity" || key === "total") return Number(v) || 0;
    return safeText_(v);
  });

  const r = sh.getLastRow() + 1;
  const range = sh.getRange(r, 1, 1, columns.length);
  range.setNumberFormat("@"); // всё как текст (телефоны с «+»)…
  sh.getRange(r, 2).setNumberFormat("dd.MM.yyyy HH:mm"); // …кроме даты
  columns.forEach(function (c, i) {
    if (c[1] === "quantity") sh.getRange(r, i + 1).setNumberFormat("0");
    if (c[1] === "total") sh.getRange(r, i + 1).setNumberFormat("#,##0 ₽");
  });
  range.setValues([values]);

  // Журнал согласий: ошибка здесь не должна мешать записи заказа
  if (body.consents) {
    try {
      logConsents_(ss, body.consents);
    } catch (err) {
      console.error("Согласия: " + err);
    }
  }

  if (NOTIFY_EMAIL) {
    MailApp.sendEmail(
      NOTIFY_EMAIL,
      "Новая заявка " + row.id + (isIntl ? " (международная)" : ""),
      columns
        .map(function (c, i) {
          return c[0] + ": " + values[i];
        })
        .join("\n"),
    );
  }
  return { ok: true, row: r };
}

function updateOrder_(ss, body) {
  const patch = body.patch || {};
  const targets = [
    [SHEET_RU, COLUMNS_RU],
    [SHEET_INTL, COLUMNS_INTL],
  ];
  for (let t = 0; t < targets.length; t++) {
    const sh = ss.getSheetByName(targets[t][0]);
    if (!sh) continue;
    const r = findRow_(sh, body.id);
    if (r < 1) continue;
    const columns = targets[t][1];
    ["status", "delivery", "payment"].forEach(function (key) {
      if (patch[key] === undefined || patch[key] === null || patch[key] === "") return;
      const col =
        columns.findIndex(function (c) {
          return c[1] === key;
        }) + 1;
      if (col > 0) sh.getRange(r, col).setValue(safeText_(patch[key]));
    });
    // Отметка о письме покупателю (сайт сам отправляет письма) — дописывается новой строкой в ячейку
    if (patch.emails) {
      const mc = headerColumn_(sh, MAIL_HEADER, true);
      const cell = sh.getRange(r, mc);
      const old = String(cell.getDisplayValue() || "");
      cell.setNumberFormat("@").setValue(safeText_((old ? old + "\n" : "") + patch.emails));
    }
    return { ok: true, row: r };
  }
  return { ok: false, error: "order not found" };
}

/** Номер колонки по заголовку в первой строке (1…); create — добавить колонку в конец, если её нет */
function headerColumn_(sh, header, create) {
  const lastCol = Math.max(1, sh.getLastColumn());
  const head = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  for (let i = 0; i < head.length; i++) if (String(head[i]).trim() === header) return i + 1;
  if (!create) return -1;
  if (lastCol >= sh.getMaxColumns()) sh.insertColumnAfter(lastCol);
  const col = lastCol + 1;
  sh.getRange(1, col).setValue(header).setFontWeight("bold").setBackground("#111111").setFontColor("#ffffff");
  sh.setColumnWidth(col, 260);
  return col;
}

function findRow_(sh, id) {
  if (!id || sh.getLastRow() < 2) return -1;
  const found = sh
    .getRange(2, 1, sh.getLastRow() - 1, 1)
    .createTextFinder(String(id))
    .matchEntireCell(true)
    .findNext();
  return found ? found.getRow() : -1;
}

/** Защита от формул в пользовательском вводе. */
function safeText_(v) {
  if (v === undefined || v === null) return "";
  const s = String(v);
  return /^[=@]/.test(s) || /^[-+]\D/.test(s) ? "'" + s : s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
