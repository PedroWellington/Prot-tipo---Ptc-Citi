import { rescheduleBlock } from "@/lib/schedule";
import { fmtLong, fmtTime } from "@/lib/time";
import { conflict, forbidden, notFound } from "../errors";
import { audit, getSettings } from "../repositories/config";
import * as repo from "../repositories/requests";
import { createSession, findSession, updateSession } from "../repositories/sessions";
import { notify, notifyStaff } from "./notifications";
import { availableSlots, withSlotLock } from "./schedule";
import { offerFreedSlot } from "./waitlist";

type CreateInput = { sessionId: string; targetStartsAt: Date; targetUnitId: string; reason?: string };

const slotFree = async (unitId: string, when: Date) => {
  const slots = await availableSlots(unitId, new Date(when.getTime() - 1000), 1);
  return slots.find((s) => s.startsAt.getTime() === when.getTime()) ?? null;
};

export async function createRequest(patientId: string, input: CreateInput) {
  const s = await findSession(input.sessionId);
  if (!s || s.patientId !== patientId) throw notFound("Sessão");
  if (s.status !== "AGENDADA" && s.status !== "CONFIRMADA") throw conflict("Esta sessão não pode ser trocada.");
  if (s.payment?.status === "AGUARDANDO") throw conflict("Conclua o pagamento antes de trocar o horário.");
  const cfg = await getSettings();
  const block = rescheduleBlock({
    startsAt: s.startsAt, now: new Date(), minHours: cfg.reschedule_min_hours,
    used: await repo.countUsedRequests(s.treatmentId), limit: cfg.reschedule_limit,
  });
  if (block) throw conflict(block);
  if (!(await slotFree(input.targetUnitId, input.targetStartsAt))) throw conflict("Esse horário não está mais livre.");
  try {
    const req = await repo.createRequest({ ...input, patientId });
    await notifyStaff("RECEPCAO", input.targetUnitId, {
      type: "TROCA", title: `Pedido de troca: ${s.patient.user.name}`,
      body: `Da sessão ${s.number} para ${fmtLong(input.targetStartsAt)} às ${fmtTime(input.targetStartsAt)}.`, href: "/recepcao/trocas",
    });
    await notify(s.patient.userId, {
      type: "TROCA", title: "Recebemos seu pedido de troca",
      body: "Seu horário original continua reservado enquanto a recepção avalia.", href: "/app/troca",
    });
    return req;
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") throw conflict("Já existe uma solicitação em andamento para esta sessão.");
    throw err;
  }
}

export async function cancelRequest(id: string, patientId: string) {
  const r = await repo.findRequest(id);
  if (!r) throw notFound("Solicitação");
  if (r.patientId !== patientId) throw forbidden();
  if (r.status !== "PENDENTE") throw conflict("Esta solicitação já foi respondida.");
  await repo.updateRequest(id, { status: "CANCELADA", decidedAt: new Date() });
}

export async function approveRequest(id: string, actorId: string) {
  const r = await repo.findRequest(id);
  if (!r) throw notFound("Solicitação");
  if (r.status !== "PENDENTE") throw conflict("Esta solicitação já foi respondida.");

  const old = r.session;
  await withSlotLock(r.targetUnitId, async (tx) => {
    const slot = (await availableSlots(r.targetUnitId, new Date(r.targetStartsAt.getTime() - 1000), 1, undefined, tx))
      .find((s) => s.startsAt.getTime() === r.targetStartsAt.getTime());
    if (!slot) throw conflict("O horário pedido foi ocupado. Recuse e sugira uma alternativa.");
    const physioId = slot.physioIds.includes(old.physioId) ? old.physioId : slot.physioIds[0];
    await updateSession(old.id, { status: "REAGENDADA" }, tx);
    const fresh = await createSession({
      treatmentId: old.treatmentId, patientId: old.patientId, unitId: r.targetUnitId, physioId, number: old.number,
      startsAt: r.targetStartsAt, provisional: old.provisional, rescheduledFromId: old.id,
    }, tx);
    await repo.updateRequest(id, { status: "APROVADA", decidedById: actorId, decidedAt: new Date() }, tx);
    await audit(actorId, "TROCA_APROVADA", "RescheduleRequest", id, { sessionId: fresh.id }, tx);
    await notify(r.patient.userId, {
      type: "TROCA", title: "Sua troca foi aprovada",
      body: `Seu novo horário é ${fmtLong(r.targetStartsAt)} às ${fmtTime(r.targetStartsAt)}.`, href: "/app",
    }, tx);
  });
  await offerFreedSlot(old.unitId, old.startsAt, old.physioId);
}

export async function rejectRequest(id: string, actorId: string, input: { response: string; suggestion?: string }) {
  const r = await repo.findRequest(id);
  if (!r) throw notFound("Solicitação");
  if (r.status !== "PENDENTE") throw conflict("Esta solicitação já foi respondida.");
  await repo.updateRequest(id, { status: "RECUSADA", ...input, decidedById: actorId, decidedAt: new Date() });
  await audit(actorId, "TROCA_RECUSADA", "RescheduleRequest", id);
  await notify(r.patient.userId, {
    type: "TROCA", title: "Não foi possível fazer sua troca",
    body: `${input.response}${input.suggestion ? ` Sugestão: ${input.suggestion}` : ""} Seu horário original continua reservado.`,
    href: "/app/troca",
  });
}

/** Fila da recepção com conflito atual e alternativas; uma consulta de agenda por unidade, não por pedido. */
export async function requestQueue(unitId?: string) {
  const rows = await repo.pendingRequests(unitId);
  const now = new Date();
  const units = [...new Set(rows.map((r) => r.targetUnit.id))];
  const slotsByUnit = new Map(await Promise.all(units.map(async (id) => [id, await availableSlots(id, now, 30)] as const)));
  return rows.map((r) => {
    const slots = slotsByUnit.get(r.targetUnit.id) ?? [];
    const target = r.targetStartsAt.getTime();
    const conflictNow = !slots.some((s) => s.startsAt.getTime() === target);
    const alternatives = conflictNow
      ? [...slots].sort((a, b) => Math.abs(a.startsAt.getTime() - target) - Math.abs(b.startsAt.getTime() - target)).slice(0, 3).map((s) => s.startsAt)
      : [];
    return { ...r, conflict: conflictNow, alternatives };
  });
}

export const patientRequests = repo.patientRequests;
