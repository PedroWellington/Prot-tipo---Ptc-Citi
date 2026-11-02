export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startCron } = await import("./server/services/cron");
  startCron();
}
