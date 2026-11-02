import type { Prisma, RenewalStatus, WaitlistStatus } from "@prisma/client";
import { prisma, type Db } from "../db";

const requestView = {
  id: true, targetStartsAt: true, reason: true, status: true, response: true, suggestion: true, createdAt: true, decidedAt: true,
  targetUnit: { select: { id: true, name: true } },
  session: { select: { id: true, number: true, startsAt: true, unit: { select: { id: true, name: true } }, physio: { select: { user: { select: { name: true } } } } } },
} satisfies Prisma.RescheduleRequestSelect;

export const findRequest = (id: string, db: Db = prisma) =>
  db.rescheduleRequest.findUnique({
    where: { id },
    include: { session: true, patient: { select: { userId: true } } },
  });
export const createRequest = (data: Prisma.RescheduleRequestUncheckedCreateInput) => prisma.rescheduleRequest.create({ data });
export const updateRequest = (id: string, data: Prisma.RescheduleRequestUncheckedUpdateInput, db: Db = prisma) =>
  db.rescheduleRequest.update({ where: { id }, data });

export const patientRequests = (patientId: string) =>
  prisma.rescheduleRequest.findMany({ where: { patientId }, orderBy: { createdAt: "desc" }, take: 20, select: requestView });

export const countUsedRequests = (treatmentId: string) =>
  prisma.rescheduleRequest.count({ where: { session: { treatmentId }, status: { in: ["PENDENTE", "APROVADA"] } } });

export const pendingRequests = (unitId?: string) =>
  prisma.rescheduleRequest.findMany({
    where: { status: "PENDENTE", ...(unitId ? { targetUnitId: unitId } : {}) },
    orderBy: { createdAt: "asc" },
    select: { ...requestView, patient: { select: { type: true, user: { select: { name: true } } } } },
  });

export const requestStats = (from: Date, to: Date) =>
  prisma.rescheduleRequest.findMany({
    where: { createdAt: { gte: from, lt: to } },
    select: { status: true, createdAt: true, decidedAt: true },
  });

export const createRenewal = (data: Prisma.InsuranceRenewalUncheckedCreateInput, db: Db = prisma) => db.insuranceRenewal.create({ data });
export const reopenRenewal = (treatmentId: string, db: Db) =>
  db.insuranceRenewal.updateMany({
    where: { treatmentId, status: { in: ["LIBERADA", "NEGADA"] } },
    data: { status: "NAO_INICIADA", decidedAt: null, requestedAt: null, expectedAt: null, alertedAt: null, remindedAt: null, heldReleasedAt: null },
  });

export const findRenewal = (id: string, db: Db = prisma) =>
  db.insuranceRenewal.findUnique({ where: { id }, include: { treatment: { include: { patient: { select: { userId: true } } } } } });
export const updateRenewal = (id: string, data: Prisma.InsuranceRenewalUpdateInput, db: Db = prisma) =>
  db.insuranceRenewal.update({ where: { id }, data });

export const renewalQueue = (unitId?: string) =>
  prisma.insuranceRenewal.findMany({
    where: { treatment: { status: "ATIVO", ...(unitId ? { unitId } : {}) }, OR: [{ status: { notIn: ["LIBERADA", "NEGADA"] } }, { status: "NEGADA", heldReleasedAt: null }] },
    orderBy: { treatment: { completedSessions: "desc" } },
    select: {
      id: true, status: true, requestedAt: true, expectedAt: true, note: true, attachment: true, alertedAt: true,
      treatment: {
        select: {
          id: true, completedSessions: true, totalSessions: true,
          unit: { select: { name: true } },
          patient: { select: { insurer: true, cardNumber: true, phone: true, user: { select: { name: true } } } },
        },
      },
    },
  });

export const renewalStats = (from: Date, to: Date, unitId?: string) =>
  prisma.insuranceRenewal.findMany({
    where: { requestedAt: { gte: from, lt: to }, decidedAt: { not: null }, treatment: unitId ? { unitId } : undefined },
    select: { requestedAt: true, decidedAt: true, status: true as const },
  }) as Promise<{ requestedAt: Date; decidedAt: Date; status: RenewalStatus }[]>;

export const findWaitlist = (id: string) => prisma.waitlistEntry.findUnique({ where: { id }, include: { patient: { select: { userId: true } }, unit: { select: { name: true } } } });
export const createWaitlist = (data: Prisma.WaitlistEntryUncheckedCreateInput) => prisma.waitlistEntry.create({ data });
export const updateWaitlist = (id: string, data: Prisma.WaitlistEntryUncheckedUpdateInput, db: Db = prisma) =>
  db.waitlistEntry.update({ where: { id }, data });

const waitView = {
  id: true, weekday: true, hour: true, status: true, offeredStartsAt: true, holdUntil: true, createdAt: true,
  unit: { select: { id: true, name: true } },
} satisfies Prisma.WaitlistEntrySelect;

export const patientWaitlist = (patientId: string) =>
  prisma.waitlistEntry.findMany({ where: { patientId, status: { in: ["ATIVA", "OFERTADA"] } }, orderBy: { createdAt: "desc" }, select: waitView });

export const allWaitlist = (unitId?: string) =>
  prisma.waitlistEntry.findMany({
    where: { status: { in: ["ATIVA", "OFERTADA"] }, unitId },
    orderBy: { createdAt: "asc" },
    select: { ...waitView, patient: { select: { type: true, phone: true, user: { select: { name: true } } } } },
  });

export const nextInLine = (unitId: string, weekday: number, hour: number, excludeId?: string) =>
  prisma.waitlistEntry.findFirst({
    where: { unitId, weekday, hour, status: "ATIVA", id: excludeId ? { not: excludeId } : undefined },
    orderBy: { createdAt: "asc" },
    include: { patient: { select: { id: true, userId: true } }, unit: { select: { name: true } } },
  });

export const expiredOffers = () =>
  prisma.waitlistEntry.findMany({ where: { status: "OFERTADA", holdUntil: { lte: new Date() } } });

export const waitlistCounts = (from: Date, to: Date) =>
  prisma.waitlistEntry.groupBy({ by: ["status"], where: { createdAt: { gte: from, lt: to } }, _count: true }) as unknown as Promise<
    { status: WaitlistStatus; _count: number }[]
  >;
