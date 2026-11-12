/** Серверная проверка: существует ли у домена почта (MX-запись или хотя бы адрес сайта). Ошибки сети не блокируют заказ. */
import { resolve4, resolve6, resolveMx } from "node:dns/promises";
import { domainToASCII } from "node:url";

type Verdict = "ok" | "no-domain" | "no-mail";
const cache = new Map<string, { at: number; v: Verdict }>();
const TTL = 60 * 60 * 1000;
const LOOKUP_MS = 3000;

const missing = (err: unknown) => {
  const code = (err as { code?: string })?.code;
  return code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN";
};

function within<T>(p: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })), LOOKUP_MS);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

/** DNS сервера вообще работает? Если нет — «домена не существует» ничего не значит, и заказ не блокируем */
let dnsHealthy: { at: number; ok: boolean } | null = null;
async function dnsWorks(): Promise<boolean> {
  if (dnsHealthy && Date.now() - dnsHealthy.at < 5 * 60 * 1000) return dnsHealthy.ok;
  const ok = await within(resolveMx("gmail.com")).then(
    (r) => r.length > 0,
    () => false,
  );
  dnsHealthy = { at: Date.now(), ok };
  return ok;
}

export async function emailDomainVerdict(email: string): Promise<Verdict> {
  const domain = domainToASCII(email.slice(email.lastIndexOf("@") + 1).toLowerCase());
  if (!domain) return "no-domain";
  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  let v: Verdict = "ok";
  try {
    const mx = await within(resolveMx(domain));
    // «Null MX» (одна точка) — домен прямо заявляет, что почту не принимает
    if (mx.length > 0 && mx.every((m) => m.exchange === "" || m.exchange === ".")) v = "no-mail";
    else if (mx.length === 0) throw Object.assign(new Error("empty"), { code: "ENODATA" });
  } catch (err) {
    if (missing(err)) {
      // MX нет — почту примут на адрес сайта (A/AAAA); нет и их — домена не существует
      const found = await Promise.allSettled([within(resolve4(domain)), within(resolve6(domain))]);
      const alive = found.some((r) => r.status === "fulfilled" && r.value.length > 0);
      const unknown = found.some((r) => r.status === "rejected" && !missing(r.reason));
      v = alive || unknown || !(await dnsWorks()) ? "ok" : "no-domain";
    }
    // таймаут и прочие сбои DNS — пропускаем: лучше принять заказ, чем потерять покупателя
  }
  if (v === "ok" || dnsHealthy?.ok) cache.set(domain, { at: Date.now(), v });
  if (cache.size > 2000) cache.clear();
  return v;
}

export const EMAIL_VERDICT_TEXT = {
  ru: { "no-domain": "Такого почтового домена не существует — проверьте адрес", "no-mail": "Этот домен не принимает почту — проверьте адрес" },
  en: { "no-domain": "This email domain does not exist — please check the address", "no-mail": "This domain does not accept email — please check the address" },
} as const;
