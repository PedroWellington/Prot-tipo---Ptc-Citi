import type { RenewalStatus } from "@prisma/client";
import { DAY } from "@/lib/time";
import { prisma } from "../db";
import type { CurrentUser } from "../auth/session";
import { conflict, notFound } from "../errors";
import { audit, getSettings } from "../repositories/config";
import * as repo from "../repositories/requests";
import { activeFutureSessions, cancelSessions, clearProvisional } from "../repositories/sessions";
import { assertDeskAccess, deskScope } from "./access";
import { notify } from "./notifications";
import { offerFreedSlot } from "./waitlist";

const NEXT: Record<RenewalStatus, RenewalStatus[]> = {
  NAO_INICIADA: ["SOLICITADA"],
  SOLICITADA: ["EM_ANALISE", "LIBERADA", "NEGADA"],
  EM_ANALISE: ["LIBERADA", "NEGADA"],
  LIBERADA: [],
  NEGADA: [],
};

const guard = (user: CurrentUser, r: { treatment: { unitId: string; physioId: string | null } }) =>
  assertDeskAccess(user, r.treatment.unitId, r.treatment.physioId ?? "");

type Update = { status: RenewalStatus; note?: string; attachment?: string; expectedAt?: Date };

export async function updateRenewalStatus(id: string, input: Update, user: CurrentUser) {
  const r = await repo.findRenewal(id);
  if (!r) throw notFound("Renovação");
  await guard(user, r);
  const actorId = user.id;
  if (!NEXT[r.status].includes(input.status)) throw conflict("Essa mudança de status não é permitida.");
  const cfg = await getSettings();
  const now = new Date();
  const decided = input.status === "LIBERADA" || input.status === "NEGADA";

  await prisma.$transaction(async (tx) => {
    await repo.updateRenewal(id, {
      status: input.status,
      note: input.note ?? r.note,
      attachment: input.attachment ?? r.attachment,
      requestedAt: input.status === "SOLICITADA" ? now : r.requestedAt,
      expectedAt: input.expectedAt ?? (input.status === "SOLICITADA" ? new Date(now.getTime() + cfg.renewal_estimate_days * DAY) : r.expectedAt),
      decidedAt: decided ? now : null,
    }, tx);
    if (input.status === "LIBERADA") await clearProvisional(r.treatmentId, tx);
    await audit(actorId, `RENOVACAO_${input.status}`, "InsuranceRenewal", id, undefined, tx);
    const userId = r.treatment.patient.userId;
    const notices: Partial<Record<RenewalStatus, [string, string]>> = {
      SOLICITADA: ["Já pedimos a renovação do seu convênio", `O prazo estimado é de ${cfg.renewal_estimate_days} dias, e seu horário da 6ª sessão está guardado.`],
      LIBERADA: ["Convênio liberado", "As próximas sessões foram autorizadas. Seus horários estão confirmados."],
      NEGADA: ["Precisamos falar sobre seu convênio", "A renovação não foi aprovada. Nossa recepção vai entrar em contato para combinar os próximos passos."],
    };
    const n = notices[input.status];
    if (n) await notify(userId, { type: "RENOVACAO", title: n[0], body: n[1], href: "/app" }, tx);
  });
}

/** Renovação negada ou expirada: a recepção decide soltar os horários pré-reservados. */
export async function releaseHeldSessions(id: string, user: CurrentUser) {
  const r = await repo.findRenewal(id);
  if (!r) throw notFound("Renovação");
  await guard(user, r);
  const actorId = user.id;
  if (r.status === "LIBERADA") throw conflict("Renovação liberada: não há horários provisórios.");
  const held = await activeFutureSessions(r.treatmentId, prisma, true);
  await prisma.$transaction(async (tx) => {
    await cancelSessions(held.map((s) => s.id), "CONVENIO", tx);
    await repo.updateRenewal(id, { heldReleasedAt: new Date() }, tx);
    await audit(actorId, "PRE_RESERVA_LIBERADA", "InsuranceRenewal", id, { sessoes: held.length }, tx);
  });
  for (const s of held) await offerFreedSlot(s.unitId, s.startsAt, s.physioId);
  return { released: held.length };
}

export async function renewalQueue(user: CurrentUser) {
  const scope = await deskScope(user);
  return scope ? repo.renewalQueue(scope) : [];
}
