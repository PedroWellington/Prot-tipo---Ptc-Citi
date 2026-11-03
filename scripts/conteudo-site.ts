/**
 * Insere os textos padrão da página pública na tabela SiteContent. Toca SÓ essa tabela (nenhum usuário, sessão ou dado clínico)
 * e não sobrescreve o que o admin já editou. Idempotente.
 *
 *   npx tsx --env-file=.env.neon scripts/conteudo-site.ts
 */
import { PrismaClient } from "@prisma/client";
import { SITE_FIELDS } from "../src/lib/site-content";

const db = new PrismaClient();

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  console.log(`Banco: ${url.includes("localhost") ? "local" : url.replace(/^.*@([^/]+).*$/, "$1")}`);
  const before = await db.siteContent.count();
  const users = await db.user.count();
  const r = await db.siteContent.createMany({ data: SITE_FIELDS.map((f) => ({ key: f.key, value: f.value })), skipDuplicates: true });
  console.log({ campos: SITE_FIELDS.length, antes: before, inseridos: r.count, depois: await db.siteContent.count() });
  console.log(`Usuários antes/depois (não tocados): ${users}/${await db.user.count()}`);
}

main().finally(() => db.$disconnect());
