/**
 * Выполняется один раз при старте сервера Next.js: запускает проверку писем покупателям
 * (трек-номер, напоминание о сроке хранения) — раз в 30 минут, см. src/lib/mail/jobs.ts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startMailJobs } = await import("./lib/mail/jobs");
  startMailJobs();
}
