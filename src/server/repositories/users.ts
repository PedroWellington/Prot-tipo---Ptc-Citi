import type { Prisma, Role, VerificationPurpose } from "@prisma/client";
import { prisma, type Db } from "../db";

export const findUserByEmail = (email: string) => prisma.user.findUnique({ where: { email } });
export const findUserById = (id: string) => prisma.user.findUnique({ where: { id } });
export const updateUser = (id: string, data: Prisma.UserUpdateInput, db: Db = prisma) => db.user.update({ where: { id }, data });

export const emailOrCpfTaken = async (email: string, cpf: string) =>
  !!(await prisma.user.findUnique({ where: { email }, select: { id: true } })) ||
  !!(await prisma.patientProfile.findUnique({ where: { cpf }, select: { id: true } }));

export const createPatientUser = (data: {
  email: string; name: string; passwordHash: string; mustChangePassword?: boolean;
  profile: Omit<Prisma.PatientProfileUncheckedCreateInput, "userId">;
}) =>
  prisma.user.create({
    data: {
      email: data.email, name: data.name, passwordHash: data.passwordHash, role: "PACIENTE",
      mustChangePassword: data.mustChangePassword ?? false,
      patient: { create: data.profile },
    },
  });

export const createStaffUser = (data: {
  email: string; name: string; passwordHash: string; role: Role; unitId?: string | null; crefito?: string;
}) =>
  prisma.user.create({
    data: {
      email: data.email, name: data.name, passwordHash: data.passwordHash, role: data.role, unitId: data.unitId,
      physio: data.role === "FISIOTERAPEUTA" ? { create: { unitId: data.unitId!, crefito: data.crefito ?? "" } } : undefined,
    },
  });

export const listStaff = (take: number, skip: number, q?: string) =>
  prisma.user.findMany({
    where: { role: { not: "PACIENTE" }, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}) },
    orderBy: [{ role: "asc" }, { name: "asc" }], take, skip,
    select: { id: true, name: true, email: true, role: true, createdAt: true, deletedAt: true, unit: { select: { name: true } } },
  });

export const createVerification = (data: Prisma.EmailVerificationCreateInput) => prisma.emailVerification.create({ data });
export const findVerification = (id: string, purpose: VerificationPurpose) =>
  prisma.emailVerification.findFirst({ where: { id, purpose } });
export const updateVerification = (id: string, data: Prisma.EmailVerificationUpdateInput) =>
  prisma.emailVerification.update({ where: { id }, data });
/** Consome uma vez só: false se outra requisição chegou antes. */
export const consumeVerification = async (id: string) =>
  (await prisma.emailVerification.updateMany({ where: { id, consumedAt: null }, data: { consumedAt: new Date() } })).count === 1;
