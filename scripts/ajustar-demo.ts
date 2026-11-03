/**
 * Ajusta os dados de demonstração SEM reset e SEM seed completo. Só toca pacientes com e-mail @exemplo.test;
 * nenhuma conta de outro domínio é lida para escrita, alterada ou apagada. Idempotente: rodar de novo não duplica.
 *
 *   npx tsx --env-file=.env.neon scripts/ajustar-demo.ts
 *
 * 1. Dor (0–10) nas sessões realizadas dos tratamentos ativos que ainda não têm nota.
 * 2. Exercícios da semana nos tratamentos ativos sem nenhuma orientação.
 * 3. Faltas extras no histórico encerrado, para as taxas do enunciado: BV ~25%, CF ~17%,
 *    convênio ~18% nas sessões 1–5 (a 6ª sessão, já em ~44%, não é tocada).
 */
import { PrismaClient, type Prisma } from "@prisma/client";

const DEMO = "@exemplo.test";
const MARK = "ajuste-demo"; // marca as faltas criadas aqui: a segunda execução não cria de novo
const DAY = 86_400_000;
const db = new PrismaClient();

const EXERCISES = [
  { title: "Ponte de glúteo", message: "3 séries de 12, segurando 3 segundos no alto.", url: "https://www.youtube.com/results?search_query=ponte+de+gluteo+fisioterapia" },
  { title: "Alongamento de isquiotibiais", message: "Deitado, perna estendida com a faixa: 3 × 30 segundos de cada lado." },
  { title: "Gato e camelo", message: "10 repetições lentas, de manhã e à noite.", url: "https://www.youtube.com/results?search_query=gato+camelo+exercicio" },
];
const REASONS = ["ALIVIO_DOR", "HORARIO", "TRANSPORTE", "ESQUECIMENTO", "CONVENIO", "SAUDE"];
// Hash estável do id: a escolha das sessões não muda entre execuções
const h = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

const demoPatient = { patient: { user: { email: { endsWith: DEMO } } } } satisfies Prisma.SessionWhereInput;

async function pain() {
  const rows = await db.session.findMany({
    where: { ...demoPatient, status: "REALIZADA", painScore: null, treatment: { status: "ATIVO" } },
    select: { id: true, number: true },
  });
  for (const s of rows)
    await db.session.update({ where: { id: s.id }, data: { painScore: Math.max(1, Math.min(10, 8 - Math.round((s.number - 1) * 0.7) + (h(s.id) % 3) - 1)) } });
  return rows.length;
}

async function exercises() {
  const treatments = await db.treatment.findMany({
    where: { status: "ATIVO", completedSessions: { gt: 0 }, physioId: { not: null }, guidances: { none: {} }, patient: { user: { email: { endsWith: DEMO } } } },
    select: { id: true, physioId: true, completedSessions: true },
  });
  const now = Date.now();
  const data = treatments.flatMap((t, i) => EXERCISES.slice(0, 2 + (i % 2)).map((g, k) => ({
    ...g, treatmentId: t.id, physioId: t.physioId!, createdAt: new Date(now - (k + 1) * DAY),
    doneAt: k < t.completedSessions % 3 ? new Date(now - k * 3_600_000) : null,
  })));
  if (data.length) await db.guidance.createMany({ data });
  return data.length;
}

/** Cria `count` faltas copiando sessões realizadas do histórico encerrado (mesmo tratamento, número e horário, 2 dias antes). */
async function addMisses(unitCode: string, type: "PARTICULAR" | "CONVENIO", numbers: number[], count: number) {
  if (count <= 0) return 0;
  const since = new Date(Date.now() - 180 * DAY);
  const pool = await db.session.findMany({
    where: {
      ...demoPatient, status: "REALIZADA", startsAt: { gte: new Date(since.getTime() + 2 * DAY), lt: new Date() },
      number: { in: numbers }, unit: { code: unitCode }, patient: { type, user: { email: { endsWith: DEMO } } },
      treatment: { status: { in: ["CONCLUIDO", "ABANDONADO"] } },
    },
    select: { id: true, treatmentId: true, patientId: true, unitId: true, physioId: true, number: true, startsAt: true },
  });
  const chosen = pool.sort((a, b) => h(a.id) - h(b.id)).slice(0, count);
  await db.session.createMany({
    data: chosen.map((s, i) => ({
      treatmentId: s.treatmentId, patientId: s.patientId, unitId: s.unitId, physioId: s.physioId, number: s.number,
      startsAt: new Date(s.startsAt.getTime() - 2 * DAY), status: "FALTA" as const, reason: REASONS[i % REASONS.length], reasonNote: MARK,
    })),
  });
  return chosen.length;
}

async function rate(where: Prisma.SessionWhereInput) {
  const since = new Date(Date.now() - 180 * DAY);
  const base = { ...where, startsAt: { gte: since, lt: new Date() } };
  const [f, r] = await Promise.all([db.session.count({ where: { ...base, status: "FALTA" } }), db.session.count({ where: { ...base, status: "REALIZADA" } })]);
  return { f, b: f + r, pct: f + r ? Math.round((f / (f + r)) * 1000) / 10 : 0 };
}

/** Quantas faltas somar para chegar à taxa-alvo: (f + x) / (b + x) = alvo. */
const needed = (r: { f: number; b: number }, target: number) => Math.max(0, Math.round((target * r.b - r.f) / (1 - target)));

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  console.log(`Banco: ${url.includes("localhost") ? "local" : url.replace(/^.*@([^/]+).*$/, "$1")}`);
  const outsiders = await db.user.count({ where: { NOT: { email: { endsWith: DEMO } } } });
  console.log(`Contas de outro domínio (não tocadas): ${outsiders}`);

  const created = { dor: await pain(), exercicios: await exercises(), faltasConvenioBV: 0, faltasParticularBV: 0, faltasCF: 0 };

  if (!(await db.session.count({ where: { reasonNote: MARK } }))) {
    const conv15 = await rate({ patient: { type: "CONVENIO" }, number: { in: [1, 2, 3, 4, 5] } });
    created.faltasConvenioBV = await addMisses("BV", "CONVENIO", [1, 2, 3, 4, 5], needed(conv15, 0.18));
    const bv = await rate({ unit: { code: "BV" } });
    created.faltasParticularBV = await addMisses("BV", "PARTICULAR", [1, 2, 3, 4, 5, 7, 8, 9, 10], needed(bv, 0.25));
    const cf = await rate({ unit: { code: "CF" } });
    created.faltasCF = await addMisses("CF", "PARTICULAR", [1, 2, 3, 4, 5, 7, 8, 9, 10], needed(cf, 0.17));
  } else console.log("Faltas de ajuste já existem: nada a criar.");

  console.log("Registros criados:", created);
  console.log("Taxas agora (6 meses):", {
    BV: await rate({ unit: { code: "BV" } }), CF: await rate({ unit: { code: "CF" } }),
    convenio1a5: await rate({ patient: { type: "CONVENIO" }, number: { in: [1, 2, 3, 4, 5] } }),
    convenio6: await rate({ patient: { type: "CONVENIO" }, number: 6 }),
  });
  console.log(`Contas de outro domínio depois: ${await db.user.count({ where: { NOT: { email: { endsWith: DEMO } } } })}`);
}

main().finally(() => db.$disconnect());
