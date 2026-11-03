import type { Prisma } from "@prisma/client";
import { prisma, type Db } from "../db";

export const findActiveTreatment = (patientId: string, db: Db = prisma) =>
  db.treatment.findFirst({ where: { patientId, status: "ATIVO" }, select: { id: true, totalSessions: true } });

export const extendTreatment = (id: string, count: number, db: Db) =>
  db.treatment.update({ where: { id }, data: { totalSessions: { increment: count } } });

export const latestTreatment = (patientId: string) =>
  prisma.treatment.findFirst({
    where: { patientId },
    orderBy: { startedAt: "desc" },
    include: {
      renewal: true,
      unit: { select: { id: true, name: true, lat: true, lng: true, address: true } },
      physio: { select: { user: { select: { name: true } } } },
      guidances: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, title: true, message: true, url: true, fileName: true, createdAt: true, doneAt: true, physio: { select: { user: { select: { name: true } } } } } },
    },
  });

export const findTreatment = (id: string, db: Db = prisma) =>
  db.treatment.findUnique({
    where: { id },
    include: { renewal: true, patient: { select: { id: true, userId: true, type: true, user: { select: { name: true, email: true } } } } },
  });

export const treatmentDetail = (id: string) =>
  prisma.treatment.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, cpf: true, type: true, insurer: true, phone: true, secondContactName: true, secondContactPhone: true, user: { select: { name: true, email: true } } } },
      unit: { select: { name: true } },
      renewal: { select: { status: true } },
      guidances: { orderBy: { createdAt: "desc" }, select: { id: true, title: true, message: true, url: true, fileName: true, createdAt: true } },
      sessions: {
        orderBy: { startsAt: "asc" },
        select: { id: true, number: true, startsAt: true, status: true, reason: true, reasonNote: true, provisional: true, isReplacement: true, painScore: true },
      },
    },
  });

export const createTreatment = (data: Prisma.TreatmentUncheckedCreateInput, db: Db = prisma) => db.treatment.create({ data });
export const updateTreatment = (id: string, data: Prisma.TreatmentUpdateInput, db: Db = prisma) => db.treatment.update({ where: { id }, data });

export const incrementCompleted = (id: string, db: Db) =>
  db.treatment.update({ where: { id }, data: { completedSessions: { increment: 1 } }, select: { completedSessions: true, totalSessions: true } });

export const createGuidance = (data: Prisma.GuidanceUncheckedCreateInput) => prisma.guidance.create({ data });
export const setGuidanceDone = (id: string, patientId: string, done: boolean) =>
  prisma.guidance.updateMany({ where: { id, treatment: { patientId } }, data: { doneAt: done ? new Date() : null } });
export const guidanceWithFile = (fileName: string) =>
  prisma.guidance.findFirst({ where: { fileName }, select: { treatment: { select: { patient: { select: { userId: true } } } } } });

export const endedTreatments = (from: Date, to: Date, unitId?: string) =>
  prisma.treatment.findMany({
    where: { unitId, startedAt: { gte: from, lt: to }, status: { not: "ATIVO" } },
    select: { status: true },
  });
