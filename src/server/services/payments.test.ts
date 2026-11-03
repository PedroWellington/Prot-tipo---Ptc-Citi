import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hoursForDay } from "@/lib/schedule";
import { prisma } from "../db";
import { getUnit } from "../repositories/config";
import { pendingPayments } from "../repositories/payments";
import { expirePayments } from "./payments";
import type { CurrentUser } from "../auth/session";
import { availableSlots, bookTreatment, reactivatePayment } from "./schedule";

// Integração: precisa do Postgres com seed (docker compose up -d postgres && npm run db:seed)
const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
if (!dbUp) console.warn("payments.test: banco fora do ar, testes de expiração pulados");

describe.skipIf(!dbUp)("Expiração preguiçosa do PIX", () => {
  const started = new Date();
  let unitId: string, physioId: string, pattern: { weekday: number; hour: number }[];
  let patients: { id: string; userId: string }[];
  let paymentId: string, firstSession: Date;

  beforeAll(async () => {
    const unit = (await getUnit((await prisma.unit.findFirstOrThrow({ where: { physios: { some: {} } } })).id))!;
    unitId = unit.id;
    physioId = unit.physios[0].id;
    // Horário sem fila de espera, para a liberação não mexer em ofertas do seed
    const waiting = new Set((await prisma.waitlistEntry.findMany({ where: { unitId } })).map((w) => `${w.weekday}-${w.hour}`));
    const hour = hoursForDay(unit, 3).find((h) => !waiting.has(`3-${h}`))!;
    pattern = [{ weekday: 3, hour }];
    patients = await prisma.patientProfile.findMany({
      where: { type: "PARTICULAR", treatments: { none: { status: "ATIVO" } } }, take: 2, select: { id: true, userId: true },
    });
    expect(patients).toHaveLength(2);
  });

  afterAll(async () => {
    const patientIds = patients.map((p) => p.id);
    await prisma.session.deleteMany({ where: { patientId: { in: patientIds }, createdAt: { gte: started } } });
    const pays = await prisma.payment.findMany({ where: { patientId: { in: patientIds }, createdAt: { gte: started } }, select: { id: true } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: pays.map((p) => p.id) } } });
    await prisma.payment.deleteMany({ where: { id: { in: pays.map((p) => p.id) } } });
    await prisma.treatment.deleteMany({ where: { patientId: { in: patientIds }, startedAt: { gte: started } } });
    await prisma.notification.deleteMany({ where: { userId: { in: patients.map((p) => p.userId) }, createdAt: { gte: started } } });
  });

  const physioFreeAt = async (when: Date) =>
    (await availableSlots(unitId, new Date(when.getTime() - 1000), 1, physioId)).some((s) => s.startsAt.getTime() === when.getTime());

  it("não expira antes do prazo: a reserva segura o horário", async () => {
    const r = await bookTreatment({ patientId: patients[0].id, unitId, physioId, pattern, count: 1 }, patients[0].userId);
    paymentId = r.paymentId!;
    firstSession = r.firstSession;
    await expirePayments();
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).status).toBe("AGUARDANDO");
    expect(await physioFreeAt(firstSession)).toBe(false);
    expect((await pendingPayments({})).some((p) => p.id === paymentId)).toBe(true);
  });

  it("vencido o prazo, sai da lista e solta a agenda antes mesmo da limpeza", async () => {
    await prisma.payment.update({ where: { id: paymentId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await pendingPayments({})).some((p) => p.id === paymentId)).toBe(false);
    expect(await physioFreeAt(firstSession)).toBe(true);
  });

  it("expira no prazo e apaga as sessões reservadas", async () => {
    await expirePayments();
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).status).toBe("EXPIRADO");
    expect(await prisma.session.count({ where: { paymentId } })).toBe(0);
  });

  it("recepção reativa a reserva vencida enquanto o horário segue livre", async () => {
    const admin = (await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } })) as unknown as CurrentUser;
    await reactivatePayment(paymentId, admin);
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { sessions: true } });
    expect(p.status).toBe("AGUARDANDO");
    expect(p.sessions.map((s) => s.startsAt)).toEqual([firstSession]);
    expect(await physioFreeAt(firstSession)).toBe(false);
    // Vence de novo para o próximo teste partir do horário livre
    await prisma.payment.update({ where: { id: paymentId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expirePayments();
  });

  it("outra pessoa reserva o horário liberado", async () => {
    // Vence de novo, sem passar pelo cron: a própria reserva libera na transação
    const again = await bookTreatment({ patientId: patients[0].id, unitId, physioId, pattern, count: 1 }, patients[0].userId);
    expect(again.firstSession).toEqual(firstSession);
    await prisma.payment.update({ where: { id: again.paymentId! }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const other = await bookTreatment({ patientId: patients[1].id, unitId, physioId, pattern, count: 1 }, patients[1].userId);
    expect(other.firstSession).toEqual(firstSession);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: again.paymentId! } })).status).toBe("EXPIRADO");
    const admin = (await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } })) as unknown as CurrentUser;
    await expect(reactivatePayment(again.paymentId!, admin)).rejects.toThrow(/ocupado/);
  });

  it("duas reservas pendentes no mesmo tratamento expiram sem travar uma à outra", async () => {
    const a = await bookTreatment({ patientId: patients[0].id, unitId, physioId, pattern, count: 1 }, patients[0].userId);
    const b = await bookTreatment({ patientId: patients[0].id, unitId, physioId, pattern, count: 1 }, patients[0].userId);
    expect(b.treatmentId).toBe(a.treatmentId);
    await prisma.payment.update({ where: { id: a.paymentId! }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expirePayments();
    expect(await prisma.treatment.count({ where: { id: a.treatmentId } })).toBe(1);
    await prisma.payment.update({ where: { id: b.paymentId! }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expirePayments();
    expect(await prisma.treatment.count({ where: { id: a.treatmentId } })).toBe(0);
  });
});
