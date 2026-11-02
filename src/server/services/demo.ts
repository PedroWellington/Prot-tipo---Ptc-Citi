import bcrypt from "bcryptjs";
import { DEMO_MODE } from "@/lib/demo";
import { prisma } from "../db";
import { HISTORY_TOTAL, seedActive, seedBase, seedHistory, wipeDemo } from "../demo/seed";
import { AppError, forbidden } from "../errors";
import { audit, invalidate } from "../repositories/config";

const BATCH = 40;
export const RESET_STEPS = 1 + Math.ceil(HISTORY_TOTAL / BATCH);

/** Cada etapa cabe numa função serverless; a tela chama uma depois da outra. Os administradores ficam. */
export async function resetDemoStep(step: number, actorId: string) {
  if (!DEMO_MODE) throw forbidden();
  const plain = process.env.DEMO_PASSWORD;
  if (!plain) throw new AppError(500, "CONFIG", "Defina DEMO_PASSWORD no ambiente.");
  const password = await bcrypt.hash(plain, 10);

  if (step === 0) {
    await wipeDemo(prisma);
    await seedBase(prisma);
    await seedActive(prisma, password);
  } else {
    const from = (step - 1) * BATCH;
    await seedHistory(prisma, password, from, Math.min(from + BATCH, HISTORY_TOTAL));
  }
  const next = step + 1 < RESET_STEPS ? step + 1 : null;
  if (next === null) {
    for (const key of ["settings", "units", "messages"]) invalidate(key);
    await audit(actorId, "DEMO_RESETADA", "Setting");
  }
  return { next, total: RESET_STEPS };
}
