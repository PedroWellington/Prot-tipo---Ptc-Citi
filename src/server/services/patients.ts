import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { maskCpf } from "@/lib/cpf";
import { pickMessage, phaseLabel, progressOf } from "@/lib/progress";
import { prisma } from "../db";
import { AppError, conflict, forbidden, notFound } from "../errors";
import { audit, getSettings, listProgressMessages } from "../repositories/config";
import { exportPatientData, findPatient, findPatientByUser, searchPatients, updatePatient } from "../repositories/patients";
import { activeFutureSessions, cancelSessions, listTreatmentSessions } from "../repositories/sessions";
import { findActiveTreatment, latestTreatment, treatmentDetail, updateTreatment } from "../repositories/treatments";
import * as users from "../repositories/users";
import type { CurrentUser } from "../auth/session";
import { hashPassword, sendInvite, type RegisterPayload } from "./auth";
import { notify } from "./notifications";
import { patientLate } from "./late";
import { offerFreedSlot } from "./waitlist";
import { patientRequests } from "./reschedule";

/** Tudo que a tela "Meu tratamento" precisa, em uma resposta. */
export async function patientHome(patientId: string) {
  const t = await latestTreatment(patientId);
  const messages = await listProgressMessages();
  if (!t) return { treatment: null, message: pickMessage(messages, 0, 10) };
  const [sessions, cfg, requests] = await Promise.all([
    listTreatmentSessions(t.id),
    getSettings(),
    patientRequests(patientId),
  ]);
  const now = new Date();
  const next = sessions.find((s) => (s.status === "AGENDADA" || s.status === "CONFIRMADA") && s.startsAt > now);
  const { done, total, finished } = progressOf(t.completedSessions, t.totalSessions);
  const pending = requests.find((r) => r.status === "PENDENTE");
  const r = t.renewal;
  return {
    treatment: {
      id: t.id, status: t.status, done, total, finished, phase: phaseLabel(done, total),
      unit: t.unit, physio: t.physio?.user.name ?? null, guidances: t.guidances,
    },
    message: pickMessage(messages, done, total),
    sessions,
    nextSessionId: next?.id ?? null,
    pendingPayment: sessions.find((s) => s.payment?.status === "AGUARDANDO")?.payment?.id ?? null,
    late: await patientLate(patientId),
    pendingRequest: pending ? { id: pending.id, sessionId: pending.session.id, targetStartsAt: pending.targetStartsAt } : null,
    renewal: r && {
      status: r.status, expectedAt: r.expectedAt, estimateDays: cfg.renewal_estimate_days,
      heldReleased: !!r.heldReleasedAt,
    },
  };
}

export async function profile(userId: string) {
  const p = await findPatientByUser(userId);
  if (!p) throw notFound("Perfil");
  return { ...p, cpf: maskCpf(p.cpf) };
}

type ProfileUpdate = {
  name?: string; phone?: string; secondContactName?: string | null; secondContactPhone?: string | null;
  preferredUnitId?: string | null; notifyEmail?: boolean; notifyEducational?: boolean; onboarded?: boolean;
  bairro?: string | null; whatsappOptIn?: boolean;
};

export async function updateProfile(user: CurrentUser, patientId: string, { name, onboarded, ...data }: ProfileUpdate) {
  await updatePatient(patientId, { ...data, ...(data.whatsappOptIn === undefined ? {} : { whatsappOptInAt: data.whatsappOptIn ? new Date() : null }) });
  if (data.whatsappOptIn !== undefined) await audit(user.id, data.whatsappOptIn ? "WHATSAPP_AUTORIZADO" : "WHATSAPP_REVOGADO", "PatientProfile", patientId);
  if (name || onboarded) await users.updateUser(user.id, { ...(name ? { name } : {}), ...(onboarded ? { onboardedAt: new Date() } : {}) });
  await audit(user.id, "PERFIL_ALTERADO", "PatientProfile", patientId);
}

export async function exportData(user: CurrentUser, patientId: string) {
  await audit(user.id, "DADOS_EXPORTADOS", "PatientProfile", patientId);
  return exportPatientData(patientId);
}

/** Exclusão LGPD: anonimiza a identidade e mantém sessões sem dados pessoais para o prontuário e as métricas. */
export async function deleteAccount(user: CurrentUser, patientId: string, password: string) {
  const full = await users.findUserById(user.id);
  if (!full || !(await bcrypt.compare(password, full.passwordHash))) throw new AppError(400, "SENHA_ATUAL", "Senha incorreta.");
  const p = await findPatient(patientId);
  if (!p) throw notFound("Perfil");
  const treatment = await findActiveTreatment(patientId);
  const future = treatment ? await activeFutureSessions(treatment.id) : [];
  await prisma.$transaction(async (tx) => {
    if (treatment) await updateTreatment(treatment.id, { status: "ABANDONADO", endedAt: new Date(), endReason: "CONTA_EXCLUIDA" }, tx);
    await cancelSessions(future.map((s) => s.id), "CONTA_EXCLUIDA", tx);
    await tx.waitlistEntry.updateMany({ where: { patientId, status: { in: ["ATIVA", "OFERTADA"] } }, data: { status: "CANCELADA" } });
    await updatePatient(patientId, {
      cpf: `excluido-${patientId}`, phone: "", insurer: null, cardNumber: null, secondContactName: null, secondContactPhone: null,
      notifyEmail: false, notifyEducational: false, bairro: null, whatsappOptIn: false, whatsappOptInAt: null,
    }, tx);
    await users.updateUser(user.id, {
      email: `excluido-${user.id}@removido.invalid`, name: "Conta excluída", passwordHash: randomBytes(32).toString("hex"),
      deletedAt: new Date(), tokenVersion: { increment: 1 },
    }, tx);
    await audit(user.id, "CONTA_EXCLUIDA", "User", user.id, undefined, tx);
  });
  for (const s of future) await offerFreedSlot(s.unitId, s.startsAt, s.physioId);
}

export async function staffSearch(user: CurrentUser, q: string | undefined, take: number, skip: number, activeOnly = false) {
  const physioId = user.role === "FISIOTERAPEUTA" ? user.physio!.id : undefined;
  const rows = await searchPatients(q, take, skip, physioId, activeOnly);
  return rows.map(({ cpf, ...r }) => ({ ...r, cpf: maskCpf(cpf) }));
}

export async function staffTreatmentDetail(user: CurrentUser, id: string) {
  const t = await treatmentDetail(id);
  if (!t) throw notFound("Tratamento");
  if (user.role === "FISIOTERAPEUTA" && t.physioId !== user.physio?.id) throw forbidden();
  await audit(user.id, "PRONTUARIO_ACESSADO", "Treatment", id);
  return { ...t, patient: { ...t.patient, cpf: maskCpf(t.patient.cpf) } };
}

export async function createPatientByStaff(actorId: string, data: RegisterPayload & { consent: true }) {
  if (await users.emailOrCpfTaken(data.email, data.cpf)) throw conflict("Já existe uma conta com este CPF ou e-mail.");
  const { name, email, ...profileData } = data;
  delete (profileData as { consent?: true }).consent;
  const user = await users.createPatientUser({
    email, name, passwordHash: await hashPassword(randomBytes(24).toString("hex")),
    profile: { ...profileData, consentAt: new Date() },
  });
  await audit(actorId, "PACIENTE_CADASTRADO", "User", user.id);
  await sendInvite(email, name);
  await notify(user.id, { type: "BOAS_VINDAS", title: "Bem-vindo à Clínica Movimento", body: "Sua conta foi criada pela recepção. Use o link do e-mail de convite para criar sua senha.", href: "/app" });
  return { id: user.id };
}
