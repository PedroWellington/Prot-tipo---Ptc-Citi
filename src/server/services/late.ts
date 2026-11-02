import type { LateStatus } from "@prisma/client";
import { recifeParts, fmtLong, fmtTime, HOUR } from "@/lib/time";
import { prisma } from "../db";
import { conflict, forbidden, notFound } from "../errors";
import { audit, getUnit } from "../repositories/config";
import { createSession, findSession, nextActiveSession, updateSession } from "../repositories/sessions";
import { appendReplacement, markMissed } from "./sessions";
import { notify, notifyStaff } from "./notifications";
import { withSlotLock } from "./schedule";
import { offerFreedSlot } from "./waitlist";
import { recordReply, sendWhatsApp } from "./whatsapp";

const OPEN: LateStatus[] = ["AGUARDANDO", "A_CAMINHO"];
const ETA_BUTTONS = [
  { id: "caminho5", label: "A caminho (+5 min)" },
  { id: "caminho15", label: "A caminho (+15 min)" },
  { id: "nao", label: "Não vou conseguir" },
];
const OFFER_BUTTONS = [{ id: "sim", label: "Quero a vaga" }, { id: "nao", label: "Não posso" }];

const log = (actorId: string | null, action: string, eventId: string, meta?: Record<string, string | number>) =>
  audit(actorId, action, "LateEvent", eventId, meta);

/** WhatsApp só com opt-in; sem ele, notificação no app e e-mail. */
async function reachPatient(
  profile: { phone: string; whatsappOptIn: boolean; secondContactName: string | null; secondContactPhone: string | null; user: { name: string; id: string } },
  m: { text: string; title: string; href: string; kind: string; refId: string; buttons: { id: string; label: string }[]; template: string },
) {
  if (!profile.whatsappOptIn) {
    await notify(profile.user.id, { type: "ATRASO", title: m.title, body: m.text, href: m.href });
    return "app";
  }
  const { text, kind, refId, buttons, template } = m;
  await sendWhatsApp({ userId: profile.user.id, contact: profile.user.name, phone: profile.phone, text, kind, refId, buttons, template });
  if (profile.secondContactPhone)
    await sendWhatsApp({ contact: `${profile.secondContactName ?? "Segundo contato"} (2º contato)`, phone: profile.secondContactPhone, text, kind, refId, buttons, template });
  return "whatsapp";
}

const profileOf = (patientId: string) =>
  prisma.patientProfile.findUniqueOrThrow({
    where: { id: patientId },
    select: { phone: true, whatsappOptIn: true, secondContactName: true, secondContactPhone: true, user: { select: { id: true, name: true } } },
  });

/** Abre o evento e pergunta ao paciente. Vale para o cron e para o botão da recepção. */
export async function startLate(sessionId: string, actorId: string | null) {
  const s = await findSession(sessionId);
  if (!s) throw notFound("Sessão");
  if (s.status !== "AGENDADA" && s.status !== "CONFIRMADA") throw conflict("Esta sessão já foi encerrada.");
  if (s.checkedInAt) throw conflict("O paciente já fez check-in.");
  const unit = await getUnit(s.unitId);
  if (!unit) throw notFound("Unidade");
  const deadlineAt = new Date(Math.max(s.startsAt.getTime(), Date.now()) + unit.lateToleranceMin * 60_000);
  const event = await prisma.lateEvent.create({ data: { sessionId, unitId: s.unitId, deadlineAt } }).catch(() => {
    throw conflict("Este atraso já está em acompanhamento.");
  });
  await updateSession(sessionId, { lateAt: new Date() });
  await log(actorId, actorId ? "ATRASO_MARCADO_RECEPCAO" : "ATRASO_DETECTADO", event.id);
  const channel = await reachPatient(await profileOf(s.patientId), {
    title: "Notamos que você ainda não chegou",
    text: `Notamos que você ainda não chegou à sua sessão das ${fmtTime(s.startsAt)} em ${unit.name}. Você está a caminho?`,
    href: "/app", kind: "ATRASO", refId: event.id, buttons: ETA_BUTTONS, template: "atraso_sessao",
  });
  await log(null, channel === "whatsapp" ? "ATRASO_WHATSAPP_ENVIADO" : "ATRASO_AVISO_APP_ENVIADO", event.id);
  return event;
}

/** Sem resposta ou "não vou conseguir": oferece à lista de espera, em ordem de entrada. */
async function openOffers(eventId: string) {
  const e = await prisma.lateEvent.findUniqueOrThrow({ where: { id: eventId }, include: { session: true, unit: { select: { name: true, slotHoldMin: true } } } });
  // Atendida antes do fim da tolerância: não há vaga nenhuma para oferecer
  const stillOpen = e.session.status === "AGENDADA" || e.session.status === "CONFIRMADA";
  if (e.status !== "DESISTIU" && (!stillOpen || e.session.checkedInAt)) {
    await prisma.lateEvent.update({ where: { id: eventId }, data: { status: "ENCERRADA", closedAt: new Date() } });
    return log(null, "ATRASO_RESOLVIDO_SEM_VAGA", eventId);
  }
  const { weekday, hour } = recifeParts(e.session.startsAt);
  const inscritos = await prisma.waitlistEntry.findMany({
    where: { unitId: e.unitId, weekday, hour, status: "ATIVA", patientId: { not: e.session.patientId } },
    orderBy: { createdAt: "asc" }, select: { id: true, patientId: true },
  });
  // Quem entrou duas vezes na lista recebe uma oferta só, a mais antiga
  const entries = inscritos.filter((x, i) => inscritos.findIndex((y) => y.patientId === x.patientId) === i);
  const closing = !entries.length;
  const { count } = await prisma.lateEvent.updateMany({
    where: { id: eventId, status: { in: [...OPEN, "DESISTIU"] } },
    data: closing ? { status: "ENCERRADA", closedAt: new Date() } : { status: "OFERTADA", offerEndsAt: new Date(Date.now() + e.unit.slotHoldMin * 60_000) },
  });
  if (!count) return;
  if (closing) return log(null, "VAGA_SEM_LISTA_DE_ESPERA", eventId);
  await log(null, "VAGA_OFERTADA", eventId, { pacientes: entries.length });

  const text = `Surgiu uma vaga ${fmtLong(e.session.startsAt)} às ${fmtTime(e.session.startsAt)} em ${e.unit.name}. Quer aproveitar?`;
  for (const entry of entries) {
    const offer = await prisma.lateOffer.create({ data: { lateEventId: eventId, waitlistEntryId: entry.id, patientId: entry.patientId } });
    await reachPatient(await profileOf(entry.patientId), {
      title: "Surgiu uma vaga", text, href: "/app/troca", kind: "VAGA", refId: offer.id, buttons: OFFER_BUTTONS, template: "vaga_lista_espera",
    });
  }
}

export async function replyLate(eventId: string, button: string, patientId?: string) {
  const e = await prisma.lateEvent.findUnique({ where: { id: eventId }, include: { session: { select: { patientId: true } } } });
  if (!e) throw notFound("Atraso");
  if (patientId && e.session.patientId !== patientId) throw forbidden();
  if (!OPEN.includes(e.status)) throw conflict("Este atraso já foi resolvido.");
  if (button === "nao") {
    await prisma.lateEvent.update({ where: { id: eventId }, data: { status: "DESISTIU" } });
    await markMissed(e.sessionId, { status: "DESMARCADA", reason: "ATRASO", note: "Avisou que não conseguiria chegar" }, null, { offerSlot: false });
    await log(null, "PACIENTE_NAO_VEM", eventId);
    return openOffers(eventId);
  }
  const etaMinutes = Number(button.replace("caminho", ""));
  await prisma.lateEvent.update({ where: { id: eventId }, data: { status: "A_CAMINHO", etaMinutes } });
  await log(null, "PACIENTE_A_CAMINHO", eventId, { minutos: etaMinutes });
}

export async function replyOffer(offerId: string, button: string, patientId?: string) {
  const offer = await prisma.lateOffer.findUnique({ where: { id: offerId } });
  if (!offer) throw notFound("Oferta");
  if (patientId && offer.patientId !== patientId) throw forbidden();
  if (button === "sim") return acceptOffer(offerId);
  await prisma.lateOffer.updateMany({ where: { id: offerId, status: "ENVIADA" }, data: { status: "RECUSADA", respondedAt: new Date() } });
  await log(null, "VAGA_RECUSADA", offer.lateEventId);
}

/** Primeiro a confirmar leva: o lock por unidade serializa os aceites e o status decide. */
async function acceptOffer(offerId: string) {
  const offer = await prisma.lateOffer.findUniqueOrThrow({ where: { id: offerId }, include: { lateEvent: { include: { session: true } } } });
  const slot = offer.lateEvent.session;
  const moved = await withSlotLock(slot.unitId, async (tx) => {
    const e = await tx.lateEvent.findUniqueOrThrow({ where: { id: offer.lateEventId } });
    if (e.status !== "OFERTADA") throw conflict("Essa vaga já foi preenchida.");
    const original = await findSession(slot.id, tx);
    if (!original) throw notFound("Sessão");
    if (original.status === "REALIZADA") throw conflict("Essa vaga não está mais disponível.");
    if (original.status === "AGENDADA" || original.status === "CONFIRMADA") {
      await updateSession(slot.id, { status: "FALTA", reason: "ATRASO", reasonNote: "Não chegou dentro da tolerância" }, tx);
      await appendReplacement(original, tx);
    }
    const current = await nextActiveSession(offer.patientId, tx);
    if (!current) throw conflict("Você não tem uma sessão futura para mover.");
    await updateSession(current.id, { status: "REAGENDADA" }, tx);
    const fresh = await createSession({
      treatmentId: current.treatmentId, patientId: offer.patientId, unitId: slot.unitId, physioId: slot.physioId, number: current.number,
      startsAt: slot.startsAt, provisional: current.provisional, rescheduledFromId: current.id, paymentId: current.paymentId,
    }, tx);
    await tx.lateEvent.update({ where: { id: e.id }, data: { status: "PREENCHIDA", filledBySessionId: fresh.id, closedAt: new Date() } });
    await tx.lateOffer.update({ where: { id: offerId }, data: { status: "ACEITA", respondedAt: new Date() } });
    await tx.waitlistEntry.update({ where: { id: offer.waitlistEntryId }, data: { status: "ACEITA" } });
    return current;
  });
  await log(null, "VAGA_PREENCHIDA", offer.lateEventId);
  await notifyOthers(offer.lateEventId, offerId, "Essa vaga já foi preenchida", "Outra pessoa confirmou primeiro. Você continua na lista de espera.");
  const { user } = await profileOf(offer.patientId);
  await notify(user.id, { type: "VAGA", title: "A vaga é sua", body: `Sua sessão foi movida para ${fmtLong(slot.startsAt)} às ${fmtTime(slot.startsAt)}.`, href: "/app" });
  await offerFreedSlot(moved.unitId, moved.startsAt, moved.physioId);
  return { ok: true };
}

async function notifyOthers(eventId: string, exceptOfferId: string | null, title: string, body: string) {
  const open = await prisma.lateOffer.findMany({ where: { lateEventId: eventId, status: "ENVIADA", id: exceptOfferId ? { not: exceptOfferId } : undefined } });
  await prisma.lateOffer.updateMany({ where: { id: { in: open.map((o) => o.id) } }, data: { status: "ENCERRADA", respondedAt: new Date() } });
  for (const o of open) {
    const p = await profileOf(o.patientId);
    await notify(p.user.id, { type: "VAGA", title, body, href: "/app/troca" });
    if (p.whatsappOptIn) await sendWhatsApp({ userId: p.user.id, contact: p.user.name, phone: p.phone, text: `${title}. ${body}`, kind: "INFO" });
  }
}

/** Chegou. Sem vaga preenchida, cancela as ofertas; preenchida, avisa a recepção para reagendar. */
export async function checkIn(sessionId: string, actorId: string) {
  const s = await findSession(sessionId);
  if (!s) throw notFound("Sessão");
  const outcome = await withSlotLock(s.unitId, async (tx) => {
    const e = await tx.lateEvent.findUnique({ where: { sessionId } });
    if (e?.status === "PREENCHIDA") return { filled: true, eventId: e.id };
    const fresh = await findSession(sessionId, tx);
    if (fresh?.status !== "AGENDADA" && fresh?.status !== "CONFIRMADA") throw conflict("Esta sessão já foi encerrada.");
    await updateSession(sessionId, { checkedInAt: new Date() }, tx);
    if (e) await tx.lateEvent.update({ where: { id: e.id }, data: { status: "CHEGOU", closedAt: new Date() } });
    return { filled: false, eventId: e?.id ?? null };
  });
  if (outcome.filled) {
    await log(actorId, "CHEGOU_APOS_VAGA_PREENCHIDA", outcome.eventId!);
    await notifyStaff("RECEPCAO", s.unitId, {
      type: "ATRASO", title: `Reagendar: ${s.patient.user.name}`, body: "Chegou depois que a vaga foi preenchida. A reposição já está ao fim do plano.", href: "/recepcao",
    });
    throw conflict("A vaga já foi preenchida. Reagende o paciente: a reposição já está ao fim do plano.");
  }
  await audit(actorId, "CHECK_IN", "Session", sessionId);
  if (outcome.eventId) {
    await log(actorId, "PACIENTE_CHEGOU", outcome.eventId);
    await notifyOthers(outcome.eventId, null, "A vaga não está mais disponível", "O paciente do horário chegou. Você continua na lista de espera.");
  }
  return { status: s.status };
}

/** Cron: detecta atrasos, abre ofertas vencidas e encerra as que ninguém pegou. */
export async function runLate(now = new Date()) {
  const late = await prisma.session.findMany({
    where: {
      status: { in: ["AGENDADA", "CONFIRMADA"] }, checkedInAt: null, lateAt: null, startsAt: { lte: now, gt: new Date(now.getTime() - 2 * HOUR) },
      OR: [{ paymentId: null }, { payment: { status: "PAGO" } }],
    },
    select: { id: true },
  });
  for (const s of late) await startLate(s.id, null).catch((e) => console.error("Atraso:", (e as Error).message));

  const due = await prisma.lateEvent.findMany({ where: { status: { in: OPEN }, deadlineAt: { lte: now } }, select: { id: true } });
  for (const e of due) await openOffers(e.id);

  const expired = await prisma.lateEvent.findMany({ where: { status: "OFERTADA", offerEndsAt: { lte: now } }, select: { id: true } });
  for (const e of expired) {
    const { count } = await prisma.lateEvent.updateMany({ where: { id: e.id, status: "OFERTADA" }, data: { status: "ENCERRADA", closedAt: now } });
    if (!count) continue;
    await log(null, "VAGA_NAO_PREENCHIDA", e.id);
    await notifyOthers(e.id, null, "A oferta da vaga expirou", "Você continua na lista de espera.");
  }
}

export async function lateTimeline(sessionId: string) {
  const e = await prisma.lateEvent.findUnique({ where: { sessionId }, select: { id: true, status: true, etaMinutes: true, deadlineAt: true, offerEndsAt: true } });
  if (!e) return { steps: [] };
  const steps = await prisma.auditLog.findMany({ where: { entity: "LateEvent", entityId: e.id }, orderBy: { createdAt: "asc" }, select: { id: true, action: true, createdAt: true, meta: true } });
  return { ...e, steps };
}

export const patientLate = (patientId: string) =>
  prisma.lateEvent.findFirst({
    where: { session: { patientId }, status: { in: OPEN } }, orderBy: { createdAt: "desc" },
    select: { id: true, status: true, session: { select: { startsAt: true } } },
  });

export const patientOffers = (patientId: string) =>
  prisma.lateOffer.findMany({
    where: { patientId, status: "ENVIADA", lateEvent: { status: "OFERTADA" } },
    select: { id: true, lateEvent: { select: { offerEndsAt: true, session: { select: { startsAt: true } }, unit: { select: { name: true } } } } },
  });

/** Resposta tocada na caixa simulada ou vinda do webhook da Meta. */
export async function handleWhatsAppReply(messageId: string, buttonId: string) {
  const { kind, refId } = await recordReply(messageId, buttonId);
  if (!refId) return;
  if (kind === "ATRASO") return replyLate(refId, buttonId);
  if (kind === "VAGA") return replyOffer(refId, buttonId);
}
