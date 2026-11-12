/**
 * Подключение к PostgreSQL без сторонних библиотек (как и почта, см. src/lib/mail/smtp.ts):
 * протокол PostgreSQL 3.0, шифрование SSL, вход по паролю SCRAM-SHA-256 или MD5,
 * запросы с параметрами ($1, $2…), небольшой пул соединений.
 *
 * Адрес базы — переменная DATABASE_URL (панель Timeweb → база → «Показать данные подключения»):
 *   postgresql://gen_user:ПАРОЛЬ@186.246.2.249:5432/default_db
 * Параметры в конце адреса (необязательно):
 *   ?sslmode=disable | prefer (по умолчанию) | require | verify-full
 *   DATABASE_CA — сертификат Timeweb (PEM) для проверки сервера (sslmode=verify-full)
 */
import crypto from "node:crypto";
import net from "node:net";
import tls from "node:tls";

export interface PgConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  sslmode: "disable" | "prefer" | "require" | "verify-full";
  ca?: string;
}

export class PgError extends Error {
  /** Код ошибки PostgreSQL (23505 — нарушение уникальности и т. п.) */
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

/** Раскодировать %XX, а если в пароле просто стоит «%» — оставить как есть */
const safeDecode = (v: string) => {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
};

const sslmodeOf = (mode: string | null | undefined, ca?: string): PgConfig["sslmode"] => {
  const m = (mode || "prefer").toLowerCase();
  const out: PgConfig["sslmode"] =
    m === "disable" ? "disable" : m === "require" ? "require" : m === "verify-full" || m === "verify-ca" ? "verify-full" : "prefer";
  return ca && out === "prefer" ? "verify-full" : out;
};

/**
 * Строка подключения в любом виде, как её копируют из панели:
 *   postgresql://user:пароль@host:5432/db?sslmode=require   (пароль может содержать @ # / ? % : — не обязательно кодировать)
 *   psql 'postgresql://…'                                    (команда целиком — берём адрес из неё)
 *   host=… port=5432 user=… password=… dbname=…              (формат libpq)
 */
export function parseDatabaseUrl(input: string, ca?: string): PgConfig {
  const text = input.trim();
  const url = /postgres(?:ql)?:\/\/[^\s'"]+/.exec(text)?.[0];
  if (url) {
    const rest = url.replace(/^postgres(?:ql)?:\/\//, "");
    // учётные данные — до последней «@» (в пароле «@» тоже бывает)
    const at = rest.lastIndexOf("@");
    const cred = at >= 0 ? rest.slice(0, at) : "";
    const tail = at >= 0 ? rest.slice(at + 1) : rest;
    const colon = cred.indexOf(":");
    const user = safeDecode(colon >= 0 ? cred.slice(0, colon) : cred);
    const password = colon >= 0 ? safeDecode(cred.slice(colon + 1)) : "";
    const m = /^(\[[^\]]+\]|[^:/?]+)(?::(\d+))?(?:\/([^?]*))?(?:\?(.*))?$/.exec(tail);
    if (!m || !user) throw new PgError("DATABASE_URL записан неверно: ожидается postgresql://пользователь:пароль@адрес:5432/база");
    const q = new URLSearchParams(m[4] ?? "");
    return {
      host: m[1].replace(/^\[|\]$/g, ""),
      port: Number(m[2]) || 5432,
      user,
      password,
      database: safeDecode(m[3] ?? "") || user,
      sslmode: sslmodeOf(q.get("sslmode"), ca),
      ...(ca ? { ca } : {}),
    };
  }
  // host=… port=… user=… password=… dbname=…
  const kv: Record<string, string> = {};
  for (const p of text.matchAll(/(\w+)\s*=\s*('(?:[^'\\]|\\.)*'|\S+)/g)) kv[p[1].toLowerCase()] = p[2].replace(/^'|'$/g, "").replace(/\\(.)/g, "$1");
  if (kv.host && kv.user) {
    return {
      host: kv.host,
      port: Number(kv.port) || 5432,
      user: kv.user,
      password: kv.password ?? "",
      database: kv.dbname || kv.database || kv.user,
      sslmode: sslmodeOf(kv.sslmode, ca),
      ...(ca ? { ca } : {}),
    };
  }
  throw new PgError("DATABASE_URL записан неверно: ожидается postgresql://пользователь:пароль@адрес:5432/база");
}

/** Настройки базы. Ошибку в записи DATABASE_URL сообщает при первом запросе, а не роняет сайт. */
export function dbConfig(): PgConfig | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  const ca = process.env.DATABASE_CA?.trim().replace(/\\n/g, "\n");
  return parseDatabaseUrl(url, ca || undefined);
}

/** Соединение шифруется, но сертификат сервера не проверяется: в DATABASE_URL просят verify-full, а сертификата Timeweb нет */
export function dbTlsUnverified(): boolean {
  try {
    const c = dbConfig();
    return Boolean(c && c.sslmode === "verify-full" && !c.ca);
  } catch {
    return false;
  }
}

/** База подключена (задан DATABASE_URL) — даже если записан с ошибкой: тогда запросы вернут понятную ошибку */
export const dbConfigured = () => Boolean(process.env.DATABASE_URL?.trim());

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

type Param = string | number | boolean | Date | null | undefined | object;

const CONNECT_TIMEOUT_MS = 10_000;
const QUERY_TIMEOUT_MS = 30_000;

/* ─────────────── Сообщения протокола ─────────────── */

function msg(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(5);
  head.write(type, 0, "latin1");
  head.writeInt32BE(body.length + 4, 1);
  return Buffer.concat([head, body]);
}

const cstr = (s: string) => Buffer.concat([Buffer.from(s, "utf8"), Buffer.from([0])]);
const i16 = (n: number) => {
  const b = Buffer.alloc(2);
  b.writeInt16BE(n);
  return b;
};
const i32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeInt32BE(n);
  return b;
};

function paramText(v: Param): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "boolean") return v ? "t" : "f";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Значение колонки (текстовый формат) → JS по типу (OID) */
function parseValue(text: string, oid: number): unknown {
  switch (oid) {
    case 16: // bool
      return text === "t";
    case 20: // int8
    case 21: // int2
    case 23: // int4
    case 700: // float4
    case 701: // float8
    case 1700: // numeric
      return Number(text);
    case 114: // json
    case 3802: // jsonb
      return JSON.parse(text);
    case 1082: // date
      return text;
    case 1114: // timestamp
    case 1184: {
      // timestamptz → ISO-строка
      const d = new Date(text.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
      return Number.isNaN(d.getTime()) ? text : d.toISOString();
    }
    default:
      return text;
  }
}

function errorFrom(body: Buffer): PgError {
  const f: Record<string, string> = {};
  let i = 0;
  while (i < body.length && body[i] !== 0) {
    const code = String.fromCharCode(body[i]);
    const end = body.indexOf(0, i + 1);
    f[code] = body.toString("utf8", i + 1, end);
    i = end + 1;
  }
  return new PgError(`PostgreSQL: ${f.M ?? "ошибка"}${f.D ? ` (${f.D})` : ""}`, f.C);
}

/* ─────────────── Соединение ─────────────── */

class Connection {
  private socket!: net.Socket | tls.TLSSocket;
  private buf: Buffer = Buffer.alloc(0);
  private waiters: ((m: { type: string; body: Buffer } | Error) => void)[] = [];
  private queue: { type: string; body: Buffer }[] = [];
  private failure: Error | null = null;
  dead = false;
  lastUsed = Date.now();

  constructor(private cfg: PgConfig) {}

  private onData = (d: Buffer) => {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    while (this.buf.length >= 5) {
      const len = this.buf.readInt32BE(1);
      if (this.buf.length < len + 1) break;
      const m = { type: String.fromCharCode(this.buf[0]), body: this.buf.subarray(5, len + 1) };
      this.buf = this.buf.subarray(len + 1);
      const w = this.waiters.shift();
      if (w) w(m);
      else this.queue.push(m);
    }
  };

  private fail = (e: Error) => {
    this.dead = true;
    if (!this.failure) this.failure = e;
    for (const w of this.waiters.splice(0)) w(this.failure);
  };

  private attach(s: net.Socket | tls.TLSSocket) {
    this.socket = s;
    s.on("data", this.onData);
    s.on("error", this.fail);
    s.on("close", () => this.fail(new PgError("PostgreSQL: соединение закрыто")));
  }

  private next(timeoutMs = QUERY_TIMEOUT_MS): Promise<{ type: string; body: Buffer }> {
    const q = this.queue.shift();
    if (q) return Promise.resolve(q);
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((res, rej) => {
      const t = setTimeout(() => {
        this.fail(new PgError("PostgreSQL: сервер не отвечает"));
        this.socket.destroy();
      }, timeoutMs);
      this.waiters.push((m) => {
        clearTimeout(t);
        if (m instanceof Error) rej(m);
        else res(m);
      });
    });
  }

  private write(b: Buffer) {
    this.socket.write(b);
  }

  async open(): Promise<void> {
    const { host, port, sslmode } = this.cfg;
    const raw = await new Promise<net.Socket>((res, rej) => {
      const s = net.connect({ host, port });
      const t = setTimeout(() => {
        s.destroy();
        rej(new PgError(`PostgreSQL: нет соединения с ${host}:${port}`));
      }, CONNECT_TIMEOUT_MS);
      s.once("connect", () => {
        clearTimeout(t);
        s.removeAllListeners("error");
        res(s);
      });
      s.once("error", (e: NodeJS.ErrnoException) => {
        clearTimeout(t);
        rej(new PgError(`PostgreSQL: нет соединения с ${host}:${port} (${e.code || e.message})`));
      });
    });

    if (sslmode !== "disable") {
      // SSLRequest: сервер отвечает одним байтом «S» (согласен) или «N»
      raw.write(Buffer.concat([i32(8), i32(80877103)]));
      const answer = await new Promise<string>((res, rej) => {
        raw.once("data", (d: Buffer) => {
          if (d.length !== 1) rej(new PgError("PostgreSQL: неожиданный ответ на запрос SSL"));
          else res(String.fromCharCode(d[0]));
        });
        raw.once("error", rej);
      });
      raw.removeAllListeners("error");
      if (answer === "S") {
        // verify-full без сертификата Timeweb (DATABASE_CA) проверить нечем — соединение всё равно шифруется
        const verify = sslmode === "verify-full" && Boolean(this.cfg.ca);
        const secured = await new Promise<tls.TLSSocket>((res, rej) => {
          const t = tls.connect(
            {
              socket: raw,
              ...(net.isIP(host) ? {} : { servername: host }),
              rejectUnauthorized: verify,
              ...(this.cfg.ca ? { ca: this.cfg.ca } : {}),
              ...(verify && net.isIP(host) ? { checkServerIdentity: () => undefined } : {}),
            },
            () => res(t),
          );
          t.once("error", (e) => rej(new PgError(`PostgreSQL: ошибка SSL — ${e.message}`)));
        });
        secured.removeAllListeners("error");
        this.attach(secured);
      } else if (sslmode === "prefer") {
        this.attach(raw);
      } else {
        raw.destroy();
        throw new PgError("PostgreSQL: сервер не поддерживает SSL, а в DATABASE_URL указано sslmode=" + sslmode);
      }
    } else {
      this.attach(raw);
    }

    // StartupMessage, протокол 3.0
    const params = Buffer.concat([
      cstr("user"),
      cstr(this.cfg.user),
      cstr("database"),
      cstr(this.cfg.database),
      cstr("client_encoding"),
      cstr("UTF8"),
      cstr("application_name"),
      cstr("kamui-site"),
      cstr("TimeZone"),
      cstr("UTC"),
      Buffer.from([0]),
    ]);
    const body = Buffer.concat([i32(196608), params]);
    this.write(Buffer.concat([i32(body.length + 4), body]));
    await this.authenticate();
  }

  private async authenticate(): Promise<void> {
    let scram: { clientFirstBare: string; nonce: string; serverSignature?: Buffer } | null = null;
    for (;;) {
      const m = await this.next(CONNECT_TIMEOUT_MS);
      if (m.type === "E") throw errorFrom(m.body);
      if (m.type === "Z") return;
      if (m.type !== "R") continue; // ParameterStatus, BackendKeyData, NoticeResponse
      const code = m.body.readInt32BE(0);
      if (code === 0) continue; // AuthenticationOk
      if (code === 3) {
        if (this.cfg.sslmode === "prefer" && !(this.socket instanceof tls.TLSSocket))
          throw new PgError("PostgreSQL: сервер просит пароль открытым текстом без шифрования — отказ");
        this.write(msg("p", cstr(this.cfg.password)));
      } else if (code === 5) {
        const salt = m.body.subarray(4, 8);
        const md5 = (b: Buffer | string) => crypto.createHash("md5").update(b).digest("hex");
        const inner = md5(this.cfg.password + this.cfg.user);
        this.write(msg("p", cstr("md5" + md5(Buffer.concat([Buffer.from(inner), salt])))));
      } else if (code === 10) {
        const mechs = m.body.toString("utf8", 4).split("\0");
        if (!mechs.includes("SCRAM-SHA-256")) throw new PgError(`PostgreSQL: неподдерживаемый способ входа (${mechs.join(", ")})`);
        const nonce = crypto.randomBytes(18).toString("base64");
        const clientFirstBare = `n=,r=${nonce}`;
        const first = Buffer.from(`n,,${clientFirstBare}`, "utf8");
        this.write(msg("p", Buffer.concat([cstr("SCRAM-SHA-256"), i32(first.length), first])));
        scram = { clientFirstBare, nonce };
      } else if (code === 11 && scram) {
        const serverFirst = m.body.toString("utf8", 4);
        const attrs = Object.fromEntries(serverFirst.split(",").map((kv) => [kv[0], kv.slice(2)]));
        if (!attrs.r?.startsWith(scram.nonce)) throw new PgError("PostgreSQL: ошибка входа SCRAM (nonce)");
        const salt = Buffer.from(attrs.s ?? "", "base64");
        const iterations = Number(attrs.i);
        const salted = crypto.pbkdf2Sync(this.cfg.password.normalize("NFKC"), salt, iterations, 32, "sha256");
        const hmac = (key: Buffer, s: string) => crypto.createHmac("sha256", key).update(s).digest();
        const clientKey = hmac(salted, "Client Key");
        const storedKey = crypto.createHash("sha256").update(clientKey).digest();
        const withoutProof = `c=biws,r=${attrs.r}`;
        const authMessage = `${scram.clientFirstBare},${serverFirst},${withoutProof}`;
        const signature = hmac(storedKey, authMessage);
        const proof = Buffer.from(clientKey.map((b, i) => b ^ signature[i]));
        scram.serverSignature = hmac(hmac(salted, "Server Key"), authMessage);
        this.write(msg("p", Buffer.from(`${withoutProof},p=${proof.toString("base64")}`, "utf8")));
      } else if (code === 12 && scram) {
        const v = /v=([^,]+)/.exec(m.body.toString("utf8", 4))?.[1] ?? "";
        if (!scram.serverSignature || !crypto.timingSafeEqual(Buffer.from(v, "base64"), scram.serverSignature))
          throw new PgError("PostgreSQL: сервер не подтвердил подлинность (SCRAM)");
      } else {
        throw new PgError(`PostgreSQL: неподдерживаемый способ входа (код ${code})`);
      }
    }
  }

  /** Запрос с параметрами ($1, $2…) — расширенный протокол */
  async query<T = Record<string, unknown>>(sql: string, params: Param[] = []): Promise<QueryResult<T>> {
    if (this.dead) throw this.failure ?? new PgError("PostgreSQL: соединение закрыто");
    this.lastUsed = Date.now();
    const values = params.map(paramText);
    const bind = Buffer.concat([
      cstr(""),
      cstr(""),
      i16(0),
      i16(values.length),
      ...values.flatMap((v) => (v === null ? [i32(-1)] : [i32(Buffer.byteLength(v)), Buffer.from(v, "utf8")])),
      i16(0),
    ]);
    this.write(
      Buffer.concat([
        msg("P", Buffer.concat([cstr(""), cstr(sql), i16(0)])),
        msg("B", bind),
        msg("D", Buffer.concat([Buffer.from("P"), cstr("")])),
        msg("E", Buffer.concat([cstr(""), i32(0)])),
        msg("S", Buffer.alloc(0)),
      ]),
    );
    return this.collect<T>();
  }

  /** Несколько команд одной строкой, без параметров (создание таблиц) */
  async exec(sql: string): Promise<void> {
    if (this.dead) throw this.failure ?? new PgError("PostgreSQL: соединение закрыто");
    this.lastUsed = Date.now();
    this.write(msg("Q", cstr(sql)));
    await this.collect();
  }

  private async collect<T>(): Promise<QueryResult<T>> {
    let fields: { name: string; oid: number }[] = [];
    const rows: T[] = [];
    let rowCount = 0;
    let error: PgError | null = null;
    for (;;) {
      const m = await this.next();
      switch (m.type) {
        case "T": {
          const n = m.body.readInt16BE(0);
          let i = 2;
          fields = [];
          for (let k = 0; k < n; k++) {
            const end = m.body.indexOf(0, i);
            const name = m.body.toString("utf8", i, end);
            i = end + 1;
            const oid = m.body.readInt32BE(i + 6);
            i += 18;
            fields.push({ name, oid });
          }
          break;
        }
        case "D": {
          const n = m.body.readInt16BE(0);
          let i = 2;
          const row: Record<string, unknown> = {};
          for (let k = 0; k < n; k++) {
            const len = m.body.readInt32BE(i);
            i += 4;
            if (len < 0) row[fields[k].name] = null;
            else {
              row[fields[k].name] = parseValue(m.body.toString("utf8", i, i + len), fields[k].oid);
              i += len;
            }
          }
          rows.push(row as T);
          break;
        }
        case "C": {
          const tag = m.body.toString("utf8", 0, m.body.length - 1);
          const n = Number(tag.split(" ").pop());
          if (Number.isFinite(n)) rowCount = n;
          break;
        }
        case "E":
          error = errorFrom(m.body);
          break;
        case "Z":
          if (error) throw error;
          return { rows, rowCount };
        default:
          break; // ParseComplete, BindComplete, NoData, Notice, ParameterStatus
      }
    }
  }

  close() {
    this.dead = true;
    try {
      this.socket.end(msg("X", Buffer.alloc(0)));
    } catch {
      /* уже закрыто */
    }
  }
}

/* ─────────────── Пул соединений ─────────────── */

const POOL_SIZE = 4;
const IDLE_MS = 60_000;

class Pool {
  private idle: Connection[] = [];
  private busy = 0;
  private waiting: ((c: Connection | Error) => void)[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(private cfg: PgConfig) {}

  private async acquire(): Promise<Connection> {
    while (this.idle.length) {
      const c = this.idle.pop()!;
      if (!c.dead) {
        this.busy++;
        return c;
      }
    }
    if (this.busy < POOL_SIZE) {
      this.busy++;
      const c = new Connection(this.cfg);
      try {
        await c.open();
      } catch (err) {
        this.busy--;
        c.close();
        this.wake();
        throw err;
      }
      this.sweep();
      return c;
    }
    return new Promise((res, rej) => this.waiting.push((c) => (c instanceof Error ? rej(c) : res(c))));
  }

  private release(c: Connection) {
    this.busy--;
    if (!c.dead) this.idle.push(c);
    this.wake();
  }

  private wake() {
    const w = this.waiting.shift();
    if (!w) return;
    this.acquire().then(w, (e: Error) => w(e));
  }

  /** Неиспользуемые соединения закрываем через минуту — сервер может оборвать их сам */
  private sweep() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const now = Date.now();
      this.idle = this.idle.filter((c) => {
        if (c.dead) return false;
        if (now - c.lastUsed > IDLE_MS) {
          c.close();
          return false;
        }
        return true;
      });
      if (!this.idle.length && !this.busy && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }, 15_000);
    this.timer.unref?.();
  }

  async use<R>(fn: (c: Connection) => Promise<R>): Promise<R> {
    const c = await this.acquire();
    try {
      return await fn(c);
    } finally {
      this.release(c);
    }
  }

  close() {
    for (const c of this.idle) c.close();
    this.idle = [];
  }
}

const POOL = Symbol.for("kamui.pgPool");

function pool(): Pool {
  const cfg = dbConfig();
  if (!cfg) throw new PgError("База данных не подключена (DATABASE_URL)");
  const g = globalThis as unknown as Record<symbol, { key: string; pool: Pool } | undefined>;
  const key = JSON.stringify(cfg);
  if (!g[POOL] || g[POOL]!.key !== key) {
    g[POOL]?.pool.close();
    g[POOL] = { key, pool: new Pool(cfg) };
  }
  return g[POOL]!.pool;
}

const isConnectionError = (e: unknown) => e instanceof PgError && !e.code && /соединение закрыто/.test(e.message);

/** Запрос к базе. Оборванное простаивавшее соединение — одна повторная попытка на новом. */
export async function sql<T = Record<string, unknown>>(text: string, params: Param[] = []): Promise<QueryResult<T>> {
  try {
    return await pool().use((c) => c.query<T>(text, params));
  } catch (err) {
    if (!isConnectionError(err)) throw err;
    return pool().use((c) => c.query<T>(text, params));
  }
}

/** Несколько команд без параметров (создание таблиц) */
export async function sqlExec(text: string): Promise<void> {
  return pool().use((c) => c.exec(text));
}

/** Транзакция: все запросы внутри fn — на одном соединении */
export async function transaction<R>(fn: (q: <T = Record<string, unknown>>(text: string, params?: Param[]) => Promise<QueryResult<T>>) => Promise<R>): Promise<R> {
  return pool().use(async (c) => {
    await c.exec("BEGIN");
    try {
      const r = await fn((text, params = []) => c.query(text, params));
      await c.exec("COMMIT");
      return r;
    } catch (err) {
      await c.exec("ROLLBACK").catch(() => undefined);
      throw err;
    }
  });
}

export function closeDb() {
  const g = globalThis as unknown as Record<symbol, { pool: Pool } | undefined>;
  g[POOL]?.pool.close();
  delete g[POOL];
}
