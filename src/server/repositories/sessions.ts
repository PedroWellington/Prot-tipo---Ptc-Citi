import type { Prisma, SessionStatus } from "@prisma/client";
import { prisma, type Db } from "../db";

export const ACTIVE: SessionStatus[] = ["AGENDADA", "CONFIRMADA"];

const card = {
  id: true, number: true, startsAt: true, status: true, provisional: true, reason: true, reasonNote: true, noticeHours: true,
  isReplacement: true, confirmedAt: true, treatmentId: true, checkedInAt: true, lateAt: true,
  payment: { select: { id: true, status: true } },
  late: { select: { status: true } },
  unit: { select: { id: true, code: true, name: true } },
  physio: { select: { id: true, user: { select: { name: true } } } },
} satisfies Prisma.SessionSelect;

const withPatient = {
  ...card,
  patient: { select: { id: true, type: true, insurer: true, phone: true, user: { select: { name: true } } } },
  treatment: { select: { completedSessions: true, totalSessions: true, scriptDoneAt: true } },
} satisfies Prisma.SessionSelect;

export const findSession = (id: string, db: Db = prisma) =>
  db.session.findUnique({
    where: { id },
    include: { payment: { select: { status: true } }, treatment: { include: { renewal: true } }, patient: { select: { id: true, userId: true, type: true, user: { select: { name: true } } } } },
  });

export const listTreatmentSessions = (treatmentId: string) =>
  prisma.session.findMany({ where: { treatmentId }, orderBy: { startsAt: "asc" }, select: card });

export const listPatientUpcoming = (patientId: string) =>
  prisma.session.findMany({
    where: { patientId, status: { in: ACTIVE }, startsAt: { gt: new Date() } },
    orderBy: { startsAt: "asc" }, select: card,
  });

/** Sessão ainda não paga é só reserva: não pode ser movida. */
const settled = { OR: [{ paymentId: null }, { payment: { status: "PAGO" as const } }] };

export const nextActiveSession = (patientId: string, db: Db = prisma) =>
  db.session.findFirst({ where: { patientId, status: { in: ACTIVE }, startsAt: { gt: new Date() }, ...settled }, orderBy: { startsAt: "asc" } });

export const patientActiveTimes = (patientId: string, db: Db = prisma) =>
  db.session.findMany({ where: { patientId, status: { in: ACTIVE }, startsAt: { gt: new Date() } }, select: { startsAt: true } });

export const listAgenda = (where: Prisma.SessionWhereInput, take = 300) =>
  prisma.session.findMany({ where, orderBy: { startsAt: "asc" }, take, select: withPatient });

/** Sessões que ocupam horário no intervalo, para checagem de conflito. */
export const busySessions = (unitId: string, from: Date, to: Date, db: Db = prisma) =>
  db.session.findMany({
    where: { unitId, status: { in: ACTIVE }, startsAt: { gte: from, lt: to } },
    select: { startsAt: true, physioId: true },
  });

export const heldSlots = (unitId: string, from: Date, to: Date, db: Db = prisma) =>
  db.waitlistEntry.findMany({
    where: { unitId, status: "OFERTADA", holdUntil: { gt: new Date() }, offeredStartsAt: { gte: from, lt: to } },
    select: { offeredStartsAt: true, offeredPhysioId: true },
  });

export const holidaysBetween = (unitId: string, from: Date, to: Date, db: Db = prisma) =>
  db.holiday.findMany({ where: { date: { gte: new Date(from.getTime() - 864e5), lte: to }, OR: [{ unitId: null }, { unitId }] }, select: { date: true } });

export const createSession = (data: Prisma.SessionUncheckedCreateInput, db: Db = prisma) => db.session.create({ data });
export const createSessions = (data: Prisma.SessionCreateManyInput[], db: Db = prisma) => db.session.createMany({ data });
export const updateSession = (id: string, data: Prisma.SessionUncheckedUpdateInput, db: Db = prisma) => db.session.update({ where: { id }, data });

export const lastActiveSession = (treatmentId: string, db: Db = prisma) =>
  db.session.findFirst({ where: { treatmentId, status: { in: ACTIVE } }, orderBy: { startsAt: "desc" } });

/** Faltou: quem vem depois assume o número seguinte, para o "X de N" seguir em ordem. */
export const shiftNumbersAfter = (treatmentId: string, after: Date, db: Db = prisma) =>
  db.session.updateMany({ where: { treatmentId, status: { in: ACTIVE }, startsAt: { gt: after } }, data: { number: { decrement: 1 } } });

export const clearProvisionalUpTo = (treatmentId: string, number: number, db: Db = prisma) =>
  db.session.updateMany({ where: { treatmentId, number: { lte: number } }, data: { provisional: false } });

export const clearProvisional = (treatmentId: string, db: Db = prisma) =>
  db.session.updateMany({ where: { treatmentId, provisional: true }, data: { provisional: false } });

export const activeFutureSessions = (treatmentId: string, db: Db = prisma, provisionalOnly = false) =>
  db.session.findMany({
    where: { treatmentId, status: { in: ACTIVE }, startsAt: { gt: new Date() }, ...(provisionalOnly ? { provisional: true } : {}) },
  });

export const sessionsNeedingReminder = (from: Date, to: Date, reminderHours: number) =>
  prisma.session.findMany({
    where: { status: "AGENDADA", startsAt: { gt: from, lte: to }, tokens: { none: { reminderHours } }, ...settled },
    select: { id: true, startsAt: true, unit: { select: { name: true } }, patient: { select: { userId: true } } },
  });

export const unconfirmedSessions = (from: Date, to: Date) =>
  prisma.session.findMany({
    where: { status: "AGENDADA", unconfirmedAlertAt: null, startsAt: { gt: from, lte: to }, ...settled },
    select: { id: true, unitId: true, startsAt: true, patient: { select: { phone: true, user: { select: { name: true } } } } },
  });

export const markUnconfirmedAlerted = (ids: string[]) =>
  prisma.session.updateMany({ where: { id: { in: ids } }, data: { unconfirmedAlertAt: new Date() } });

export const createToken = (data: Prisma.ConfirmationTokenUncheckedCreateInput) => prisma.confirmationToken.create({ data });

export const findToken = (tokenHash: string) =>
  prisma.confirmationToken.findUnique({
    where: { tokenHash },
    include: { session: { select: { id: true, number: true, startsAt: true, status: true, unit: { select: { name: true } }, physio: { select: { user: { select: { name: true } } } } } } },
  });

export const useToken = async (id: string) =>
  (await prisma.confirmationToken.updateMany({ where: { id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } })).count === 1;

export type MetricSql = {
  status: string; number: number; startsAt: Date; type: "PARTICULAR" | "CONVENIO"; unitCode: string;
  noticeHours: number | null; confirmedAt: Date | null; lateAt: Date | null;
};

// Uma query só com join: o dashboard agrega em memória (computeSessionMetrics)
export const metricRows = (from: Date, to: Date, unitId?: string) =>
  prisma.$queryRaw<MetricSql[]>`
    SELECT s."status", s."number", s."startsAt", p."type", u."code" AS "unitCode", s."noticeHours", s."confirmedAt", s."lateAt"
    FROM "Session" s
    JOIN "PatientProfile" p ON p."id" = s."patientId"
    JOIN "Unit" u ON u."id" = s."unitId"
    WHERE s."startsAt" >= ${from} AND s."startsAt" < ${to}
      AND (${unitId ?? null}::text IS NULL OR s."unitId" = ${unitId ?? null})`;

export const exportSessions = (from: Date, to: Date, unitId?: string) =>
  prisma.session.findMany({
    where: { startsAt: { gte: from, lt: to }, unitId },
    orderBy: { startsAt: "asc" },
    select: {
      number: true, startsAt: true, status: true, reason: true, noticeHours: true, lateAt: true,
      unit: { select: { code: true } },
      patient: { select: { type: true, insurer: true } },
      physio: { select: { user: { select: { name: true } } } },
    },
  });

export const cancelSessions = (ids: string[], reason: string, db: Db = prisma, note?: string) =>
  db.session.updateMany({ where: { id: { in: ids } }, data: { status: "DESMARCADA", reason, reasonNote: note } });
