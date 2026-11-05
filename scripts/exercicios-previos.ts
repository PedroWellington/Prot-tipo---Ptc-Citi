/**
 * Insere os exercícios prévios genéricos na tabela Exercise. Toca SÓ essa tabela (nenhum usuário, sessão ou dado clínico)
 * e não sobrescreve o que o admin já editou (pula slugs existentes). Idempotente.
 *
 *   npx tsx --env-file=.env.neon scripts/exercicios-previos.ts
 */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_EXERCISES } from "../src/lib/exercicios";

const db = new PrismaClient();

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  console.log(`Banco: ${url.includes("localhost") ? "local" : url.replace(/^.*@([^/]+).*$/, "$1")}`);
  const before = await db.exercise.count();
  const users = await db.user.count();
  const r = await db.exercise.createMany({ data: DEFAULT_EXERCISES, skipDuplicates: true });
  console.log({ exercicios: DEFAULT_EXERCISES.length, antes: before, inseridos: r.count, depois: await db.exercise.count() });
  console.log(`Usuários antes/depois (não tocados): ${users}/${await db.user.count()}`);
}

main().finally(() => db.$disconnect());
