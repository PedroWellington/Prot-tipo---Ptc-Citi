// Atualiza só endereço e coordenadas das unidades, sem seed e sem apagar nada.
// Usa o DATABASE_URL do ambiente: npm run db:unidades
import { PrismaClient } from "@prisma/client";
import { UNIDADES } from "../src/lib/unidades";

const db = new PrismaClient();

async function main() {
  for (const { code, address, lat, lng } of UNIDADES) {
    const { count } = await db.unit.updateMany({ where: { code }, data: { address, lat, lng } });
    if (!count) throw new Error(`Unidade ${code} não encontrada`);
    await db.auditLog.create({ data: { action: "UNIDADE_ALTERADA", entity: "Unit", meta: { code, origem: "script" } } });
    console.log(`${code}: ${address} (${lat}, ${lng})`);
  }
}

main().finally(() => db.$disconnect());
