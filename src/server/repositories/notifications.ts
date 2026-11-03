import type { Prisma, Role } from "@prisma/client";
import { prisma, type Db } from "../db";

export const createNotification = (data: Prisma.NotificationUncheckedCreateInput, db: Db = prisma) => db.notification.create({ data });

export const usersByRole = (role: Role, unitId?: string | null, db: Db = prisma) =>
  db.user.findMany({ where: { role, deletedAt: null, ...(unitId ? { unitId } : {}) }, select: { id: true } });

export const physioUserId = async (physioId: string, db: Db = prisma) =>
  (await db.physiotherapist.findUnique({ where: { id: physioId }, select: { userId: true } }))?.userId ?? null;

export const patientNotifyPrefs = (userId: string, db: Db = prisma) =>
  db.patientProfile.findUnique({ where: { userId }, select: { notifyEmail: true, notifyEducational: true } });

export const listNotifications = (userId: string, take = 30) =>
  prisma.notification.findMany({
    where: { userId, dismissedAt: null }, orderBy: { createdAt: "desc" }, take,
    select: { id: true, type: true, title: true, body: true, href: true, readAt: true, createdAt: true },
  });

export const countUnread = (userId: string) => prisma.notification.count({ where: { userId, readAt: null, dismissedAt: null } });

export const markRead = (userId: string, id?: string) =>
  prisma.notification.updateMany({ where: { userId, readAt: null, ...(id ? { id } : {}) }, data: { readAt: new Date() } });

export const dismiss = (userId: string, id?: string) =>
  prisma.notification.updateMany({ where: { userId, dismissedAt: null, ...(id ? { id } : {}) }, data: { dismissedAt: new Date() } });

export const dueEmails = (limit = 25) =>
  prisma.notification.findMany({
    where: { emailStatus: "PENDENTE", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
    take: limit, orderBy: { createdAt: "asc" },
    include: {
      user: {
        select: {
          email: true, name: true, unitId: true,
          patient: { select: { phone: true, secondContactName: true, secondContactPhone: true, preferredUnitId: true } },
        },
      },
    },
  });

export const updateNotification = (id: string, data: Prisma.NotificationUpdateInput) => prisma.notification.update({ where: { id }, data });
