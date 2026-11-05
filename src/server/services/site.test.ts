import { describe, expect, it } from "vitest";
import { prisma } from "../db";
import { siteData } from "./site";

const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);

describe.skipIf(!dbUp)("Página pública: dados do banco", () => {
  it("a equipe (faixa em movimento e cartões) são os fisioterapeutas cadastrados, com a unidade", async () => {
    const { team } = await siteData();
    const physios = await prisma.physiotherapist.findMany({ where: { active: true }, select: { user: { select: { name: true } }, unit: { select: { name: true } } } });
    expect(team.length).toBeGreaterThan(0);
    for (const t of team) expect(physios.some((p) => p.user.name === t.name && p.unit.name === t.unit)).toBe(true);
  });
});
