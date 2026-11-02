import type { Prisma } from "@prisma/client";
import { prisma, type Db } from "../db";

export const findPatient = (id: string) =>
  prisma.patientProfile.findUnique({ where: { id }, include: { user: { select: { id: true, name: true, email: true, deletedAt: true } } } });

export const findPatientByUser = (userId: string) =>
  prisma.patientProfile.findUnique({
    where: { userId },
    include: { user: { select: { name: true, email: true, createdAt: true } }, preferredUnit: { select: { id: true, name: true } } },
  });

export const patientProfileType = (id: string) => prisma.patientProfile.findUniqueOrThrow({ where: { id }, select: { type: true } });

export const updatePatient = (id: string, data: Prisma.PatientProfileUncheckedUpdateInput, db: Db = prisma) =>
  db.patientProfile.update({ where: { id }, data });

export const searchPatients = (q: string | undefined, take: number, skip: number, physioId?: string, activeOnly = false) =>
  prisma.patientProfile.findMany({
    where: {
      user: { deletedAt: null, ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) },
      ...(physioId ? { treatments: { some: { physioId, ...(activeOnly ? { status: "ATIVO" as const } : {}) } } } : {}),
    },
    orderBy: { user: { name: "asc" } }, take, skip,
    select: {
      id: true, cpf: true, phone: true, type: true, insurer: true,
      user: { select: { name: true, email: true } },
      treatments: {
        where: physioId ? { physioId } : undefined,
        orderBy: { startedAt: "desc" }, take: 1,
        select: { id: true, status: true, completedSessions: true, totalSessions: true, scriptDoneAt: true, unit: { select: { name: true } } },
      },
    },
  });

export const exportPatientData = (id: string) =>
  prisma.patientProfile.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, email: true, createdAt: true } },
      treatments: { include: { sessions: { select: { number: true, startsAt: true, status: true, reason: true } }, guidances: { select: { title: true, message: true, url: true, createdAt: true } } } },
      reschedule: { select: { targetStartsAt: true, status: true, reason: true, response: true, createdAt: true } },
      waitlist: { select: { weekday: true, hour: true, status: true, createdAt: true } },
    },
  });
