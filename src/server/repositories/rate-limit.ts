import { prisma } from "../db";

/** Conta a tentativa de forma atômica e devolve o total na janela atual. */
export async function hitRateLimit(key: string, windowSec: number) {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt")
    VALUES (${key}, 1, NOW() + make_interval(secs => ${windowSec}::double precision))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."resetAt" < NOW() THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" < NOW() THEN EXCLUDED."resetAt" ELSE "RateLimit"."resetAt" END
    RETURNING "count"`;
  return rows[0].count;
}

export const purgeRateLimits = () => prisma.rateLimit.deleteMany({ where: { resetAt: { lt: new Date() } } });
