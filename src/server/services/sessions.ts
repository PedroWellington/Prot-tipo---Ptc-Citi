import { randomBytes, createHash } from "node:crypto";
import { pickMessage, progressOf } from "@/lib/progress";
import { freePhysiosAt, planSessions } from "@/lib/schedule";
import { dayKey, fmtLong, fmtTime, HOUR, recifeParts } from "@/lib/time";
import type { Prisma } from "@prisma/client";
import type { CurrentUser } from "../auth/session";
import { prisma } from "../db";
import { badRequest, conflict, forbidden, notFound } from "../errors";
import { audit, getSettings, getUnit, listProgressMessages } from "../repositories/config";
import * as sessions from "../repositories/sessions";
import { findTreatment, incrementCompleted, updateTreatment } from "../repositories/treatments";
import { notify, notifyStaff } from "./notifications";
import { AUTHORIZED_BATCH, withSlotLock } from "./schedule";
import { offerFreedSlot } from "./waitlist";

const isActive = (status: string) => status === "AGENDADA" || status === "CONFIRMADA";

function assertCanHandle(user: CurrentUser, physioId: string) {
  if (user.role === "FISIOTERAPEUTA" && user.physio?.id !== physioId) throw forbidden();
}

export async function confirmSession(id: string, patientId: string | null) {
  const s = await sessions.findSession(id);
  if (!s || (patientId && s.patientId !== patientId)) throw notFound("Sessão");
  if (s.status === "CONFIRMADA") return { status: s.status };
  if (s.status !== "AGENDADA") throw conflict("Esta sessão não pode mais ser confirmada.");
  if (s.payment?.status === "AGUARDANDO") throw conflict("A sessão só é confirmada depois do pagamento.");
  await sessions.updateSession(id, { status: "CONFIRMADA", confirmedAt: new Date() });
  return { status: "CONFIRMADA" };
}

export async function markDone(id: string, user: CurrentUser) {
  const s = await sessions.findSession(id);
  if (!s) throw notFound("Sessão");
  assertCanHandle(user, s.physioId);
  if (!isActive(s.status)) throw conflict("Esta sessão já foi registrada.");
  // Em demonstração permite adiantar sessões futuras para mostrar a evolução
  if (process.env.APP_ENV === "production" && dayKey(s.startsAt) > dayKey(new Date()))
    throw badRequest("Só é possível marcar como realizada no dia da sessão.");

  const outcome = await prisma.$transaction(async (tx) => {
    await sessions.updateSession(id, { status: "REALIZADA", doneAt: new Date(), provisional: false }, tx);
    const t = await incrementCompleted(s.treatmentId, tx);
    const { done, total, finished } = progressOf(t.completedSessions, t.totalSessions);
    if (finished) await updateTreatment(s.treatmentId, { status: "CONCLUIDO", endedAt: new Date() }, tx);
    await audit(user.id, "SESSAO_REALIZADA", "Session", id, undefined, tx);

    const text = pickMessage(await listProgressMessages(), done, total);
    await notify(s.patient.userId, {
      type: "PROGRESSO", title: `Sessão ${done} de ${total} concluída`, body: text, href: "/app", educational: true,
    }, tx);

    const cfg = await getSettings();
    const r = s.treatment.renewal;
    if (r && r.status === "NAO_INICIADA") {
      const unitId = s.unitId;
      if (done === cfg.renewal_alert_session && !r.alertedAt) {
        await tx.insuranceRenewal.update({ where: { id: r.id }, data: { alertedAt: new Date() } });
        await notifyStaff("RECEPCAO", unitId, {
          type: "RENOVACAO", title: `Pedir renovação: ${s.patient.user.name}`,
          body: `Concluiu a ${done}ª sessão. Dê entrada na liberação das próximas ${AUTHORIZED_BATCH} sessões.`, href: "/recepcao/renovacoes",
        }, tx);
      }
      if (done === cfg.renewal_reminder_session && !r.remindedAt) {
        await tx.insuranceRenewal.update({ where: { id: r.id }, data: { remindedAt: new Date() } });
        await notifyStaff("RECEPCAO", unitId, {
          type: "RENOVACAO", title: `Lembrete de renovação: ${s.patient.user.name}`,
          body: `Já está na ${done}ª sessão e a renovação ainda não foi solicitada.`, href: "/recepcao/renovacoes",
        }, tx);
      }
    }
    return { done, total, finished };
  });
  return outcome;
}

/** Repõe a sessão perdida ao fim do plano, no mesmo dia da semana e hora, com renumeração. */
export async function appendReplacement(s: NonNullable<Awaited<ReturnType<typeof sessions.findSession>>>, tx: Prisma.TransactionClient) {
  await sessions.shiftNumbersAfter(s.treatmentId, s.startsAt, tx);
  if (s.treatment.renewal?.status !== "LIBERADA" && s.treatment.renewal) await sessions.clearProvisionalUpTo(s.treatmentId, AUTHORIZED_BATCH, tx);

  const last = await sessions.lastActiveSession(s.treatmentId, tx);
  const unit = await getUnit(s.unitId);
  if (!unit) return;
  // Depois da perdida e da última marcada: senão a reposição cairia no próprio horário liberado
  const from = new Date(Math.max(last?.startsAt.getTime() ?? 0, s.startsAt.getTime(), Date.now()));
  const { weekday, hour } = recifeParts(s.startsAt);
  const horizon = new Date(from.getTime() + 182 * 24 * HOUR);
  const busy = await sessions.busySessions(s.unitId, from, horizon, tx);
  const holidays = await sessions.holidaysBetween(s.unitId, from, horizon, tx);
  const closed = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
  const [date] = planSessions([{ weekday, hour }], from, 1, (d) =>
    !closed.has(dayKey(d)) && freePhysiosAt(d, [s.physioId], busy, unit.chairs).length > 0);
  if (!date) {
    await notifyStaff("RECEPCAO", s.unitId, {
      type: "REPOSICAO", title: `Reposição manual: ${s.patient.user.name}`,
      body: "Não encontramos horário automático para a sessão de reposição.", href: "/recepcao",
    }, tx);
    return;
  }
  const number = (last?.number ?? s.number - 1) + 1;
  const renewal = s.treatment.renewal;
  await sessions.createSession({
    treatmentId: s.treatmentId, patientId: s.patientId, unitId: s.unitId, physioId: s.physioId, number, startsAt: date,
    isReplacement: true, provisional: !!renewal && renewal.status !== "LIBERADA" && number > AUTHORIZED_BATCH,
  }, tx);
}

export type MissInput = { status: "FALTA" | "DESMARCADA"; reason: string; note?: string };

export async function markMissed(id: string, input: MissInput, user: CurrentUser | null, { offerSlot = true } = {}) {
  const s = await sessions.findSession(id);
  if (!s) throw notFound("Sessão");
  if (user) assertCanHandle(user, s.physioId);
  if (!isActive(s.status)) throw conflict("Esta sessão já foi registrada.");

  const noticeHours = input.status === "DESMARCADA" ? Math.max(0, (s.startsAt.getTime() - Date.now()) / HOUR) : null;
  await withSlotLock(s.unitId, async (tx) => {
    await sessions.updateSession(id, { status: input.status, reason: input.reason, reasonNote: input.note, noticeHours }, tx);
    await appendReplacement(s, tx);
    await audit(user?.id, input.status === "FALTA" ? "FALTA_REGISTRADA" : "DESMARCACAO_REGISTRADA", "Session", id, { reason: input.reason }, tx);
  });
  if (offerSlot && s.startsAt > new Date()) await offerFreedSlot(s.unitId, s.startsAt, s.physioId);
  return { status: input.status };
}

export async function abandonTreatment(treatmentId: string, reason: string, note: string | undefined, user: CurrentUser) {
  const t = await findTreatment(treatmentId);
  if (!t) throw notFound("Tratamento");
  if (user.role === "FISIOTERAPEUTA" && user.physio?.id !== t.physioId) throw forbidden();
  if (t.status !== "ATIVO") throw conflict("O tratamento não está ativo.");

  const future = await sessions.activeFutureSessions(treatmentId);
  await prisma.$transaction(async (tx) => {
    await updateTreatment(treatmentId, { status: "ABANDONADO", endedAt: new Date(), endReason: reason }, tx);
    await sessions.cancelSessions(future.map((s) => s.id), reason, tx, note);
    await audit(user.id, "TRATAMENTO_ABANDONADO", "Treatment", treatmentId, { reason }, tx);
    await notifyStaff("RECEPCAO", t.unitId, {
      type: "ABANDONO", title: `Abandono: ${t.patient.user.name}`, body: `Parou na sessão ${t.completedSessions} de ${t.totalSessions}.`, href: "/recepcao/pacientes",
    }, tx);
  });
  for (const s of future) await offerFreedSlot(s.unitId, s.startsAt, s.physioId);
}

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Cron: cria lembretes interativos e alerta a recepção sobre quem não confirmou. */
export async function runReminders(now = new Date()) {
  const cfg = await getSettings();
  const hours = [...cfg.reminder_hours].sort((a, b) => b - a);
  const base = process.env.APP_URL;
  for (let i = 0; i < hours.length; i++) {
    const h = hours[i];
    const nextH = hours[i + 1] ?? 0; // janela evita mandar o lembrete de 24h junto com o de 2h
    const due = await sessions.sessionsNeedingReminder(new Date(now.getTime() + nextH * HOUR), new Date(now.getTime() + h * HOUR), h);
    for (const s of due) {
      const token = randomBytes(32).toString("base64url");
      await sessions.createToken({ tokenHash: hash(token), sessionId: s.id, reminderHours: h, expiresAt: s.startsAt });
      const url = (a: string) => `${base}/c/${token}?a=${a}`;
      await notify(s.patient.userId, {
        type: "LEMBRETE", title: `Sua sessão é ${fmtLong(s.startsAt)}`,
        body: `Te esperamos às ${fmtTime(s.startsAt)} em ${s.unit.name}. Pode confirmar sua presença?`,
        href: "/app",
        actions: [
          { label: "Confirmo", url: url("confirmar") },
          { label: "Quero trocar", url: url("trocar") },
          { label: "Não poderei ir", url: url("cancelar") },
        ],
      });
    }
  }
  const alertWindow = Math.min(...hours);
  const pending = await sessions.unconfirmedSessions(now, new Date(now.getTime() + alertWindow * HOUR));
  for (const s of pending) {
    await notifyStaff("RECEPCAO", s.unitId, {
      type: "NAO_CONFIRMOU", title: `Sem confirmação: ${s.patient.user.name}`,
      body: `Sessão às ${fmtTime(s.startsAt)}. Telefone: ${s.patient.phone}.`, href: "/recepcao",
    });
  }
  if (pending.length) await sessions.markUnconfirmedAlerted(pending.map((s) => s.id));
}

export async function tokenInfo(token: string) {
  const row = await sessions.findToken(hash(token));
  if (!row) throw notFound("Link");
  const { session: s } = row;
  return {
    usable: !row.usedAt && row.expiresAt > new Date() && isActive(s.status),
    startsAt: s.startsAt, number: s.number, status: s.status, unit: s.unit.name, physio: s.physio.user.name,
  };
}

export async function tokenAction(token: string, action: "confirmar" | "trocar" | "cancelar", reason?: string) {
  const row = await sessions.findToken(hash(token));
  if (!row || !isActive(row.session.status)) throw conflict("Este link não é mais válido.");
  if (!(await sessions.useToken(row.id))) throw conflict("Este link já foi usado ou expirou.");
  if (action === "confirmar") await confirmSession(row.sessionId, null);
  if (action === "cancelar") await markMissed(row.sessionId, { status: "DESMARCADA", reason: reason ?? "OUTRO" }, null);
  await audit(null, `LINK_${action.toUpperCase()}`, "Session", row.sessionId);
  return { redirect: action === "trocar" ? `/app/troca?sessao=${row.sessionId}` : null };
}

export const unitAgenda = (unitId: string | undefined, from: Date, to: Date) =>
  sessions.listAgenda({ startsAt: { gte: from, lt: to }, unitId });

export const physioAgenda = (physioId: string, from: Date, to: Date) =>
  sessions.listAgenda({ startsAt: { gte: from, lt: to }, physioId });

