/**
 * Отправка писем по SMTP без сторонних библиотек: TLS (порт 465) или STARTTLS (587/25),
 * AUTH PLAIN/LOGIN, письмо из текстовой и HTML-версии (UTF-8).
 *
 * Настройки (панель Timeweb → переменные окружения):
 *   SMTP_USER=shop@abramov.shop     — ящик, с которого уходят письма (он же адрес отправителя)
 *   SMTP_PASSWORD=…                 — пароль от ящика
 *   SMTP_HOST=smtp.timeweb.ru       — по умолчанию
 *   SMTP_PORT=465                   — по умолчанию (SSL); если порт не задан и 465 закрыт — пробуем 587 (STARTTLS)
 *   MAIL_FROM_NAME=Abramov Shop     — имя отправителя
 *   MAIL_ENABLED=false              — выключить письма покупателям, не удаляя пароль
 */
import crypto from "node:crypto";
import net from "node:net";
import tls from "node:tls";

export interface SmtpConfig {
  host: string;
  port: number;
  /** true — сразу TLS (465); false — обычное соединение, затем STARTTLS, если сервер его предлагает */
  secure: boolean;
  user: string;
  pass: string;
  /** Только для проверки на тестовом сервере: не требовать STARTTLS */
  allowPlain?: boolean;
  /** Другие порты, если к основному нет соединения (хостинг закрыл порт) */
  fallbackPorts?: number[];
}

/** Нет соединения с почтовым сервером (порт закрыт, сервер не отвечает) — в отличие от отказа самого сервера */
export class SmtpConnectError extends Error {}

export interface MailMessage {
  from: { name: string; address: string };
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
}

export function smtpConfig(): SmtpConfig | null {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD;
  if (!user || !pass || process.env.MAIL_ENABLED === "false") return null;
  const port = Number(process.env.SMTP_PORT) || 465;
  return {
    host: process.env.SMTP_HOST?.trim() || "smtp.timeweb.ru",
    port,
    secure: port === 465,
    user,
    pass,
    ...(process.env.SMTP_PORT ? {} : { fallbackPorts: [587] }),
  };
}

const TIMEOUT_MS = 20_000;
const CONNECT_TIMEOUT_MS = Number(process.env.SMTP_CONNECT_TIMEOUT_MS) || 10_000;

/** «Заголовок» в кодировке RFC 2047: =?UTF-8?B?…?= кусками, чтобы строки не были длиннее 76 символов */
export function encodeWord(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const parts: string[] = [];
  let chunk = "";
  for (const ch of s) {
    if (Buffer.byteLength(chunk + ch, "utf8") > 42) {
      parts.push(chunk);
      chunk = "";
    }
    chunk += ch;
  }
  if (chunk) parts.push(chunk);
  return parts.map((p) => `=?UTF-8?B?${Buffer.from(p, "utf8").toString("base64")}?=`).join("\r\n ");
}

const b64lines = (s: string) => (Buffer.from(s, "utf8").toString("base64").match(/.{1,76}/g) ?? []).join("\r\n");

const cleanAddr = (s: string) => s.replace(/[\r\n<>]/g, "").trim();

/** Письмо целиком (заголовки + multipart/alternative) */
export function buildMessage(m: MailMessage, now = new Date()): string {
  const boundary = `kamui-${crypto.randomBytes(12).toString("hex")}`;
  const domain = m.from.address.split("@")[1] || "localhost";
  const headers = [
    `From: ${encodeWord(m.from.name)} <${cleanAddr(m.from.address)}>`,
    `To: <${cleanAddr(m.to)}>`,
    ...(m.replyTo ? [`Reply-To: <${cleanAddr(m.replyTo)}>`] : []),
    `Subject: ${encodeWord(m.subject.replace(/[\r\n]+/g, " "))}`,
    `Date: ${now.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const part = (type: string, body: string) =>
    [`--${boundary}`, `Content-Type: ${type}; charset=UTF-8`, "Content-Transfer-Encoding: base64", "", b64lines(body)].join("\r\n");
  return [...headers, "", part("text/plain", m.text), part("text/html", m.html), `--${boundary}--`, ""].join("\r\n");
}

/** Соединение с построчным чтением ответов сервера */
class Session {
  private buf = "";
  private waiters: ((line: string) => void)[] = [];
  private lines: string[] = [];
  private failure: Error | null = null;

  constructor(private socket: net.Socket | tls.TLSSocket) {
    this.attach(socket);
  }

  attach(socket: net.Socket | tls.TLSSocket) {
    this.socket = socket;
    socket.setEncoding("utf8");
    socket.setTimeout(TIMEOUT_MS, () => this.fail(new Error("SMTP: сервер не отвечает")));
    socket.on("data", (d: string) => {
      this.buf += d;
      let i: number;
      while ((i = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, i).replace(/\r$/, "");
        this.buf = this.buf.slice(i + 1);
        const w = this.waiters.shift();
        if (w) w(line);
        else this.lines.push(line);
      }
    });
    socket.on("error", (e) => this.fail(e));
    socket.on("close", () => this.fail(new Error("SMTP: соединение закрыто")));
  }

  private fail(e: Error) {
    if (!this.failure) this.failure = e;
    const ws = this.waiters.splice(0);
    ws.forEach((w) => w(""));
  }

  private nextLine(): Promise<string> {
    if (this.lines.length) return Promise.resolve(this.lines.shift()!);
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((res, rej) =>
      this.waiters.push((l) => (this.failure && !l ? rej(this.failure) : res(l))),
    );
  }

  /** Ответ сервера (многострочный «250-…» до «250 …») */
  async reply(): Promise<{ code: number; text: string }> {
    const all: string[] = [];
    for (;;) {
      const line = await this.nextLine();
      all.push(line);
      if (!/^\d{3}-/.test(line)) return { code: Number(line.slice(0, 3)), text: all.join("\n") };
    }
  }

  async cmd(line: string, expect: number[], what = line.split(" ")[0]): Promise<string> {
    this.socket.write(line + "\r\n");
    const r = await this.reply();
    if (!expect.includes(r.code)) throw new Error(`SMTP ${what}: ${r.text.slice(0, 300)}`);
    return r.text;
  }

  /** Перед STARTTLS: отцепиться от обычного соединения — дальше его читает TLS */
  detach(): net.Socket {
    const s = this.socket as net.Socket;
    s.removeAllListeners("data");
    s.removeAllListeners("error");
    s.removeAllListeners("close");
    s.setTimeout(0);
    return s;
  }

  close() {
    try {
      this.socket.end("QUIT\r\n");
    } catch {
      /* уже закрыто */
    }
  }
}

function connect(cfg: SmtpConfig): Promise<net.Socket | tls.TLSSocket> {
  return new Promise((res, rej) => {
    const ok = () => {
      s.setTimeout(0);
      s.removeListener("error", fail);
      res(s);
    };
    const s = cfg.secure
      ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host }, ok)
      : net.connect({ host: cfg.host, port: cfg.port }, ok);
    const fail = (e: NodeJS.ErrnoException) => {
      s.destroy();
      // ошибка сертификата — это уже ответ сервера, а не закрытый порт
      if (/CERT|SSL|TLS/i.test(String(e.code))) rej(e);
      else rej(new SmtpConnectError(`SMTP: нет соединения с ${cfg.host}:${cfg.port} (${e.code || e.message})`));
    };
    s.once("error", fail);
    s.setTimeout(CONNECT_TIMEOUT_MS, () => {
      s.destroy();
      rej(new SmtpConnectError(`SMTP: нет соединения с ${cfg.host}:${cfg.port}`));
    });
  });
}

/** Отправка с запасным портом: 465 закрыт хостингом → 587 (STARTTLS) */
export async function sendSmtpAny(cfg: SmtpConfig, m: MailMessage): Promise<void> {
  const ports = [cfg.port, ...(cfg.fallbackPorts ?? []).filter((p) => p !== cfg.port)];
  for (const port of ports) {
    try {
      return await sendSmtp({ ...cfg, port, secure: port === 465 }, m);
    } catch (err) {
      if (!(err instanceof SmtpConnectError) || port === ports.at(-1)) {
        if (err instanceof SmtpConnectError && ports.length > 1)
          throw new SmtpConnectError(`SMTP: нет соединения с ${cfg.host} (порты ${ports.join(", ")} закрыты или не отвечают)`);
        throw err;
      }
    }
  }
}

export async function sendSmtp(cfg: SmtpConfig, m: MailMessage): Promise<void> {
  const session = new Session(await connect(cfg));
  try {
    const hello = await session.reply();
    if (hello.code !== 220) throw new Error(`SMTP: ${hello.text.slice(0, 200)}`);
    const ehlo = () => session.cmd(`EHLO ${m.from.address.split("@")[1] || "localhost"}`, [250], "EHLO");
    let caps = await ehlo();
    if (!cfg.secure) {
      if (/STARTTLS/i.test(caps)) {
        await session.cmd("STARTTLS", [220]);
        const secured = await new Promise<tls.TLSSocket>((res, rej) => {
          const t = tls.connect({ socket: session.detach(), servername: cfg.host }, () => res(t));
          t.once("error", rej);
        });
        session.attach(secured);
        caps = await ehlo();
      } else if (!cfg.allowPlain) {
        throw new Error("SMTP: сервер не предлагает шифрование — пароль не отправлен");
      }
    }
    if (/AUTH[ =][^\n]*PLAIN/i.test(caps) || !/AUTH[ =][^\n]*LOGIN/i.test(caps)) {
      await session.cmd(`AUTH PLAIN ${Buffer.from(`\0${cfg.user}\0${cfg.pass}`, "utf8").toString("base64")}`, [235], "AUTH");
    } else {
      await session.cmd("AUTH LOGIN", [334], "AUTH");
      await session.cmd(Buffer.from(cfg.user, "utf8").toString("base64"), [334], "AUTH");
      await session.cmd(Buffer.from(cfg.pass, "utf8").toString("base64"), [235], "AUTH");
    }
    await session.cmd(`MAIL FROM:<${cleanAddr(m.from.address)}>`, [250], "MAIL FROM");
    await session.cmd(`RCPT TO:<${cleanAddr(m.to)}>`, [250, 251], "RCPT TO");
    await session.cmd("DATA", [354]);
    // Строки, начинающиеся с точки, удваиваем (в base64 их нет, но заголовки — на всякий случай)
    const data = buildMessage(m).replace(/^\./gm, "..");
    await session.cmd(`${data}\r\n.`, [250], "DATA");
  } finally {
    session.close();
  }
}
