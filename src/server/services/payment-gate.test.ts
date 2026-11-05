import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hoursForDay } from "@/lib/schedule";
import { prisma } from "../db";
import { getUnit } from "../repositories/config";
import type { CurrentUser } from "../auth/session";
import { markGenericDone } from "./exercises";
import { patientHome } from "./patients";
import { assertTreatmentUnlocked, confirmManually, expirePayments, rejectPayment } from "./payments";
import { availableSlots, bookTreatment } from "./schedule";

// Integração: precisa do Postgres com seed. Só mexe em pacientes @exemplo.test e apaga o que criou
const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);

describe.skipIf(!dbUp)("Tela do paciente só libera depois do pagamento autorizado", () => {
  const started = new Date();
  let unitId: string, physioId: string, pattern: { weekday: number; hour: number }[];
  let patients: { id: string; userId: string }[];
  let admin: CurrentUser;

  beforeAll(async () => {
    const unit = (await getUnit((await prisma.unit.findFirstOrThrow({ where: { physios: { some: {} } }, orderBy: { code: "desc" } })).id))!;
    unitId = unit.id;
    physioId = unit.physios[0].id;
    // Sexta, horário sem fila de espera: não colide com payments.test (quarta) nem com ofertas do seed
    const waiting = new Set((await prisma.waitlistEntry.findMany({ where: { unitId } })).map((w) => `${w.weekday}-${w.hour}`));
    const hour = hoursForDay(unit, 5).filter((h) => !waiting.has(`5-${h}`)).at(-1)!;
    pattern = [{ weekday: 5, hour }];
    const demo = { type: "PARTICULAR" as const, user: { email: { endsWith: "@exemplo.test" } } };
    // [1] nunca teve tratamento: depois da recusa ou da expiração ele volta mesmo ao estado inicial
    const fresh = await prisma.patientProfile.findFirstOrThrow({ where: { ...demo, treatments: { none: {} } }, orderBy: { id: "desc" }, select: { id: true, userId: true } });
    const other = await prisma.patientProfile.findFirstOrThrow({
      where: { ...demo, id: { not: fresh.id }, treatments: { none: { status: "ATIVO" } } }, orderBy: { id: "desc" }, select: { id: true, userId: true },
    });
    patients = [other, fresh];
    admin = (await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } })) as unknown as CurrentUser;
  });

  afterAll(async () => {
    const patientIds = patients.map((p) => p.id);
    await prisma.exerciseDone.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.session.deleteMany({ where: { patientId: { in: patientIds }, createdAt: { gte: started } } });
    const pays = await prisma.payment.findMany({ where: { patientId: { in: patientIds }, createdAt: { gte: started } }, select: { id: true } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: pays.map((p) => p.id) } } });
    await prisma.payment.deleteMany({ where: { id: { in: pays.map((p) => p.id) } } });
    await prisma.treatment.deleteMany({ where: { patientId: { in: patientIds }, startedAt: { gte: started } } });
    await prisma.notification.deleteMany({ where: { userId: { in: patients.map((p) => p.userId) }, createdAt: { gte: started } } });
  });

  const book = (i: number) => bookTreatment({ patientId: patients[i].id, unitId, physioId, pattern, count: 1 }, patients[i].userId);
  const physioFreeAt = async (when: Date) =>
    (await availableSlots(unitId, new Date(when.getTime() - 1000), 1, physioId)).some((s) => s.startsAt.getTime() === when.getTime());

  it("pendente: o servidor só devolve a reserva e o PIX, sem nada do tratamento", async () => {
    const r = await book(0);
    const home = await patientHome(patients[0].id);
    expect(home.treatment).toBeNull();
    expect(home.awaiting?.id).toBe(r.paymentId);
    expect(home.awaiting?.pixCode).toBeTruthy();
    expect(home.awaiting?.slots).toHaveLength(1);
    expect(home).not.toHaveProperty("sessions");
    expect(home).not.toHaveProperty("generic");
    // Mesmo chamando a API direto, exercícios e "feito" ficam bloqueados
    await expect(assertTreatmentUnlocked(patients[0].id)).rejects.toMatchObject({ code: "PAGAMENTO_PENDENTE" });
    const ex = await prisma.exercise.findFirst();
    if (ex) await expect(markGenericDone(patients[0].id, ex.id, true)).rejects.toMatchObject({ status: 403 });
  });

  it("autorizado: painel completo, exercícios prévios e registro na auditoria", async () => {
    const paymentId = (await patientHome(patients[0].id)).awaiting!.id;
    await confirmManually(paymentId, admin);
    const home = (await patientHome(patients[0].id)) as Extract<Awaited<ReturnType<typeof patientHome>>, { sessions: unknown }>;
    expect(home.awaiting).toBeNull();
    expect(home.treatment).not.toBeNull();
    // Sem exercícios da fisioterapeuta: os prévios aparecem
    expect(home.treatment.guidances).toEqual([]);
    expect(home.generic.length).toBe(await prisma.exercise.count({ where: { generic: true } }));
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entity: "Payment", entityId: paymentId, action: "PAGAMENTO_CONFIRMADO" } });
    expect(log.actorId).toBe(admin.id);
    expect(log.createdAt.getTime()).toBeGreaterThanOrEqual(started.getTime());
    await expect(assertTreatmentUnlocked(patients[0].id)).resolves.toBeUndefined();
    const ex = await prisma.exercise.findFirst();
    if (ex) {
      await markGenericDone(patients[0].id, ex.id, true);
      expect((await patientHome(patients[0].id) as { generic: { id: string; doneAt: unknown }[] }).generic.find((g) => g.id === ex.id)?.doneAt).toBeTruthy();
    }
  });

  it("recusa: libera os horários, grava o motivo e o paciente volta ao início", async () => {
    const r = await book(1);
    expect(await physioFreeAt(r.firstSession)).toBe(false);
    await rejectPayment(r.paymentId!, admin, "PIX não encontrado no extrato");
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: r.paymentId! } })).status).toBe("RECUSADO");
    expect(await physioFreeAt(r.firstSession)).toBe(true);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: r.paymentId!, action: "PAGAMENTO_RECUSADO" } });
    expect(log).toMatchObject({ actorId: admin.id, meta: expect.objectContaining({ motivo: "PIX não encontrado no extrato" }) });
    const home = await patientHome(patients[1].id);
    expect(home.treatment).toBeNull();
    expect(home.awaiting).toBeNull();
    expect(await prisma.notification.count({ where: { userId: patients[1].userId, title: "Pagamento não confirmado" } })).toBe(1);
    await expect(rejectPayment(r.paymentId!, admin)).rejects.toThrow(/não está mais aguardando/);
  });

  it("expiração sem pagamento: volta ao estado inicial com o aviso de reserva expirada", async () => {
    const r = await book(1);
    await prisma.payment.update({ where: { id: r.paymentId! }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expirePayments();
    const home = await patientHome(patients[1].id);
    expect(home.treatment).toBeNull();
    expect(home.awaiting).toBeNull();
    expect(home.expiredPayment).toBe(r.paymentId);
  });

  it("recepção de outra unidade não autoriza", async () => {
    const r = await book(1);
    const other = await prisma.unit.findFirstOrThrow({ where: { id: { not: unitId } } });
    const desk = { id: admin.id, role: "RECEPCAO", unitId: other.id } as unknown as CurrentUser;
    await expect(confirmManually(r.paymentId!, desk)).rejects.toMatchObject({ status: 403 });
    await expect(rejectPayment(r.paymentId!, desk)).rejects.toMatchObject({ status: 403 });
    await rejectPayment(r.paymentId!, admin);
  });

  it("convênio não é afetado: tratamento ativo sem pagamento segue liberado", async () => {
    const t = await prisma.treatment.findFirst({ where: { status: "ATIVO", patient: { type: "CONVENIO" } }, select: { patientId: true } });
    if (!t) return;
    const home = await patientHome(t.patientId);
    expect(home.awaiting).toBeNull();
    expect(home.treatment).not.toBeNull();
    await expect(assertTreatmentUnlocked(t.patientId)).resolves.toBeUndefined();
  });
});
