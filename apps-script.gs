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
    ["SOLD_COUNT", 49, "Уже продано — меняйте это число, сайт обновится в течение минуты"],
    ["Осталось", "=B2-B3", "Считается автоматически: TOTAL_STOCK − SOLD_COUNT"],
  ]);
  sh.getRange("A1:C1").setFontWeight("bold").setBackground("#111111").setFontColor("#ffffff");
  sh.setColumnWidth(1, 160);
  sh.setColumnWidth(3, 460);
  return sh;
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return json_({ ok: false, error: "unauthorized" });

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
  return json_({ ok: true, service: "kamui-orders" });
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
    return { ok: true, row: r };
  }
  return { ok: false, error: "order not found" };
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
