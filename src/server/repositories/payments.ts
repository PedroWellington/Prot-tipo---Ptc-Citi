import type { Prisma } from "@prisma/client";
import { prisma, type Db } from "../db";

export const createPayment = (data: Prisma.PaymentUncheckedCreateInput, db: Db = prisma) => db.payment.create({ data });

export const findPayment = (id: string) =>
  prisma.payment.findUnique({ where: { id }, include: { patient: { select: { userId: true } } } });

export const findByTxid = (txid: string) => prisma.payment.findUnique({ where: { txid }, select: { id: true, status: true } });

export const settlePayment = async (id: string, confirmedById: string | null) =>
  (await prisma.payment.updateMany({ where: { id, status: "AGUARDANDO" }, data: { status: "PAGO", paidAt: new Date(), confirmedById } })).count === 1;

export const expirePayment = async (id: string, db: Db) =>
  (await db.payment.updateMany({ where: { id, status: "AGUARDANDO" }, data: { status: "EXPIRADO", treatmentId: null } })).count === 1;

export const expiredPayments = (db: Db = prisma) =>
  db.payment.findMany({
    where: { status: "AGUARDANDO", expiresAt: { lte: new Date() } },
    select: { id: true, treatmentId: true, sessionCount: true, patient: { select: { userId: true } } },
  });

/** Horários que a expiração liberou, guardados na auditoria para a recepção poder reativar. */
export const expiryRecord = async (paymentId: string) =>
  (await prisma.auditLog.findFirst({
    where: { entity: "Payment", entityId: paymentId, action: "PAGAMENTO_EXPIRADO" }, orderBy: { createdAt: "desc" }, select: { meta: true },
  }))?.meta as { sessoes?: { unitId: string; physioId: string; startsAt: string }[] } | null | undefined;

export const reactivatePayment = async (id: string, data: { treatmentId: string; createdTreatment: boolean; expiresAt: Date }, db: Db) =>
  (await db.payment.updateMany({ where: { id, status: "EXPIRADO" }, data: { status: "AGUARDANDO", ...data } })).count === 1;

export async function deleteUnpaidSessions(paymentId: string, db: Prisma.TransactionClient) {
  const sessions = await db.session.findMany({ where: { paymentId }, orderBy: { startsAt: "asc" }, select: { unitId: true, startsAt: true, physioId: true } });
  await db.session.deleteMany({ where: { paymentId } });
  return sessions;
}

/** Devolve as sessões ao tratamento e só o apaga quando nada mais aponta para ele: outra reserva pendente pode ter somado sessões. */
export async function releaseTreatment(id: string, count: number, db: Prisma.TransactionClient) {
  await db.treatment.update({ where: { id }, data: { totalSessions: { decrement: count } } });
  await db.treatment.deleteMany({ where: { id, sessions: { none: {} }, renewal: null, guidances: { none: {} } } });
}

export const patientPayments = (patientId: string) =>
  prisma.payment.findMany({
    where: { patientId, status: { not: "EXPIRADO" } }, orderBy: { createdAt: "desc" }, take: 20,
    select: { id: true, status: true, amountCents: true, sessionCount: true, createdAt: true, paidAt: true, expiresAt: true },
  });

export const firstSessionOf = (paymentId: string) =>
  prisma.session.findFirst({ where: { paymentId }, select: { unitId: true, physioId: true } });

export const pendingPayments = (scope: { unitId?: string; physioId?: string }) =>
  prisma.payment.findMany({
    where: { status: "AGUARDANDO", expiresAt: { gt: new Date() }, ...(scope.unitId || scope.physioId ? { sessions: { some: scope } } : {}) }, orderBy: { expiresAt: "asc" },
    select: { id: true, amountCents: true, sessionCount: true, expiresAt: true, createdAt: true, patient: { select: { phone: true, user: { select: { name: true } } } } },
  });
