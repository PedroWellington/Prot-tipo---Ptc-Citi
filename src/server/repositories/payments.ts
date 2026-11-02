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

export const expiredPayments = () =>
  prisma.payment.findMany({
    where: { status: "AGUARDANDO", expiresAt: { lte: new Date() } },
    select: { id: true, treatmentId: true, createdTreatment: true, sessionCount: true, patient: { select: { userId: true } } },
  });

export async function deleteUnpaidSessions(paymentId: string, db: Prisma.TransactionClient) {
  const sessions = await db.session.findMany({ where: { paymentId }, orderBy: { startsAt: "asc" }, select: { unitId: true, startsAt: true, physioId: true } });
  await db.session.deleteMany({ where: { paymentId } });
  return sessions;
}

export async function releaseTreatment(id: string, created: boolean, count: number, db: Prisma.TransactionClient) {
  if (created) await db.treatment.delete({ where: { id } });
  else await db.treatment.update({ where: { id }, data: { totalSessions: { decrement: count } } });
}

export const patientPayments = (patientId: string) =>
  prisma.payment.findMany({
    where: { patientId, status: { not: "EXPIRADO" } }, orderBy: { createdAt: "desc" }, take: 20,
    select: { id: true, status: true, amountCents: true, sessionCount: true, createdAt: true, paidAt: true, expiresAt: true },
  });

export const pendingPayments = (unitId?: string) =>
  prisma.payment.findMany({
    where: { status: "AGUARDANDO", ...(unitId ? { sessions: { some: { unitId } } } : {}) }, orderBy: { expiresAt: "asc" },
    select: { id: true, amountCents: true, sessionCount: true, expiresAt: true, createdAt: true, patient: { select: { phone: true, user: { select: { name: true } } } } },
  });
