import { runLate } from "./late";
import { processQueue } from "./notifications";
import { expirePayments } from "./payments";
import { runReminders } from "./sessions";
import { expireOffers } from "./waitlist";

export async function tick() {
  await runReminders();
  await expireOffers();
  await expirePayments();
  await runLate();
  await processQueue();
}

export function startCron() {
  const g = globalThis as unknown as { cronStarted?: boolean };
  if (g.cronStarted) return;
  g.cronStarted = true;
  const ms = Number(process.env.CRON_INTERVAL_MS ?? 60_000);
  setInterval(() => void tick().catch((e) => console.error("Cron falhou:", (e as Error).message)), ms);
}
