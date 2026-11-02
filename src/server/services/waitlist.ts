import { fmtLong, fmtTime, HOUR, recifeParts } from "@/lib/time";
import { conflict, forbidden, notFound } from "../errors";
import { audit, getSettings } from "../repositories/config";
import * as repo from "../repositories/requests";
import { createSession, nextActiveSession, updateSession } from "../repositories/sessions";
import { notify } from "./notifications";
import { withSlotLock } from "./schedule";

export async function joinWaitlist(patientId: string, input: { unitId: string; weekday: number; hour: number }) {
  return repo.createWaitlist({ patientId, ...input });
}

export async function leaveWaitlist(id: string, patientId: string | null) {
  const entry = await repo.findWaitlist(id);
  if (!entry) throw notFound("Entrada");
  if (patientId && entry.patientId !== patientId) throw forbidden();
  await repo.updateWaitlist(id, { status: "CANCELADA" });
  if (entry.status === "OFERTADA" && entry.offeredStartsAt)
    await offerFreedSlot(entry.unitId, entry.offeredStartsAt, entry.offeredPhysioId!, id);
}

/** Vaga liberada: oferece ao primeiro da fila daquele horário e segura por tempo limitado. */
export async function offerFreedSlot(unitId: string, startsAt: Date, physioId: string, excludeId?: string) {
  if (startsAt <= new Date()) return;
  const { weekday, hour } = recifeParts(startsAt);
  const entry = await repo.nextInLine(unitId, weekday, hour, excludeId);
  if (!entry) return;
  const cfg = await getSettings();
  const minutes = cfg.waitlist_hold_minutes;
  const holdUntil = new Date(Math.min(Date.now() + minutes * 60_000, startsAt.getTime()));
  await repo.updateWaitlist(entry.id, { status: "OFERTADA", offeredStartsAt: startsAt, offeredPhysioId: physioId, holdUntil });
  await notify(entry.patient.userId, {
    type: "VAGA", title: "Abriu a vaga que você esperava",
    body: `${entry.unit.name}, ${fmtLong(startsAt)} às ${fmtTime(startsAt)}. Guardamos para você por ${minutes} minutos: confirme com um toque.`,
    href: "/app/troca",
  });
}

export async function acceptOffer(id: string, patientId: string) {
  const entry = await repo.findWaitlist(id);
  if (!entry || entry.patientId !== patientId) throw notFound("Oferta");
  if (entry.status !== "OFERTADA" || !entry.holdUntil || entry.holdUntil <= new Date()) throw conflict("Essa oferta expirou.");

  const freed = await withSlotLock(entry.unitId, async (tx) => {
    const current = await nextActiveSession(patientId, tx);
    if (!current) throw conflict("Você não tem uma sessão futura para mover.");
    await updateSession(current.id, { status: "REAGENDADA" }, tx);
    await createSession({
      treatmentId: current.treatmentId, patientId, unitId: entry.unitId, physioId: entry.offeredPhysioId!, number: current.number,
      startsAt: entry.offeredStartsAt!, provisional: current.provisional, rescheduledFromId: current.id,
    }, tx);
    await repo.updateWaitlist(id, { status: "ACEITA" }, tx);
    await audit(entry.patient.userId, "VAGA_ACEITA", "WaitlistEntry", id, undefined, tx);
    return current;
  });
  await offerFreedSlot(freed.unitId, freed.startsAt, freed.physioId);
}

/** Cron: expira ofertas não respondidas e passa ao próximo da fila. */
export async function expireOffers() {
  for (const e of await repo.expiredOffers()) {
    await repo.updateWaitlist(e.id, { status: "EXPIRADA" });
    if (e.offeredStartsAt && e.offeredStartsAt.getTime() - Date.now() > HOUR)
      await offerFreedSlot(e.unitId, e.offeredStartsAt, e.offeredPhysioId!, e.id);
  }
}

export const patientWaitlist = repo.patientWaitlist;
export const allWaitlist = repo.allWaitlist;
