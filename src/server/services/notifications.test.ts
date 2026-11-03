import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { countUnread, dismiss, listNotifications, notify } from "./notifications";

// Integração: precisa do Postgres com seed (docker compose up -d postgres && npm run db:seed)
const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);

describe.skipIf(!dbUp)("Apagar notificações do sino", () => {
  const started = new Date();
  let userId: string;

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId, createdAt: { gte: started } } });
    // "Limpar todas" também apagou as do seed: devolve ao estado de antes
    await prisma.notification.updateMany({ where: { userId, dismissedAt: { gte: started } }, data: { dismissedAt: null } });
  });

  const mine = async () => (await listNotifications(userId)).filter((n) => n.createdAt >= started);

  it("apaga uma: some da lista e do contador, mas a linha fica para a fila de e-mail", async () => {
    userId = (await prisma.user.findFirstOrThrow({ where: { role: "PACIENTE" } })).id;
    const before = await countUnread(userId);
    for (const title of ["um", "dois", "três"]) await notify(userId, { type: "TESTE", title, body: "corpo", email: false });
    const [first] = await mine();
    expect(await countUnread(userId)).toBe(before + 3);
    await dismiss(userId, first.id);
    expect((await mine()).map((n) => n.id)).not.toContain(first.id);
    expect(await countUnread(userId)).toBe(before + 2);
    expect(await prisma.notification.count({ where: { id: first.id } })).toBe(1);
  });

  it("não apaga a notificação de outra pessoa", async () => {
    const other = await prisma.user.findFirstOrThrow({ where: { role: "PACIENTE", id: { not: userId } } });
    const [n] = await mine();
    expect((await dismiss(other.id, n.id)).count).toBe(0);
  });

  it("limpar todas esvazia a lista e zera o contador", async () => {
    await dismiss(userId);
    expect(await listNotifications(userId)).toEqual([]);
    expect(await countUnread(userId)).toBe(0);
  });
});
