import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { HISTORY_TOTAL, seedActive, seedBase, seedHistory } from "../src/server/demo/seed";

const db = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const pass = process.env.ADMIN_PASSWORD;
  if (!email || !pass) throw new Error("Defina ADMIN_EMAIL e ADMIN_PASSWORD");
  const production = process.env.APP_ENV === "production";

  await seedBase(db);
  // Por perfil, não por e-mail: mudar ADMIN_EMAIL no .env não pode recriar os dados demo
  if (await db.user.count({ where: { role: "ADMIN" } })) return console.log("Seed: dados já existem, nada a fazer.");
  await db.user.create({
    data: { email, name: "Administração", passwordHash: await bcrypt.hash(pass, 12), role: "ADMIN", mustChangePassword: production },
  });
  if (!production) {
    if (!process.env.DEMO_PASSWORD) throw new Error("Defina DEMO_PASSWORD");
    const password = await bcrypt.hash(process.env.DEMO_PASSWORD, 10);
    await seedActive(db, password);
    await seedHistory(db, password, 0, HISTORY_TOTAL);
  }
  console.log(`Seed concluído (${production ? "produção: só admin" : "com dados de demonstração"}).`);
}

main().finally(() => db.$disconnect());
