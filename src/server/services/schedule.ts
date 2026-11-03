import { Prisma } from "@prisma/client";
import { freePhysiosAt, hoursForDay, isPeakHour, planSessions, type BusySlot, type WeeklySlot } from "@/lib/schedule";
import { atRecife, DAY, dayKey, recifeParts, startOfRecifeDay } from "@/lib/time";
import { prisma, type Db } from "../db";
import type { CurrentUser } from "../auth/session";
import { badRequest, conflict, notFound, slotTaken } from "../errors";
import { audit, getSettings, getUnit, listUnits } from "../repositories/config";
import * as payments from "../repositories/payments";
import { findPatient } from "../repositories/patients";
import { createRenewal, reopenRenewal } from "../repositories/requests";
import { busySessions, createSessions, heldSlots, holidaysBetween, patientActiveTimes } from "../repositories/sessions";
import { createTreatment, extendTreatment, findActiveTreatment } from "../repositories/treatments";
import { assertDeskAccess } from "./access";
import { notify } from "./notifications";
import { announceReleased, createPayment, releaseExpired } from "./payments";

export const AUTHORIZED_BATCH = 5;
const WEEKS_AHEAD = 26;

/** Serializa reservas por unidade; os índices únicos parciais são a segunda barreira. */
export async function withSlotLock<T>(unitId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  try {
    const [result, released] = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${unitId}))`;
        // Antes de reservar, solta os PIX vencidos: a linha antiga bateria nos índices únicos do horário
        const released = await releaseExpired(tx);
        return [await fn(tx), released] as const;
      },
      { timeout: 15_000 },
    );
    await announceReleased(released);
    return result;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw slotTaken();
    throw err;
  }
}

async function occupancy(unitId: string, from: Date, to: Date, db: Db) {
  const [sessions, holds, holidays] = await Promise.all([
    busySessions(unitId, from, to, db),
    heldSlots(unitId, from, to, db),
    holidaysBetween(unitId, from, to, db),
  ]);
  const busy: BusySlot[] = [
    ...sessions,
    ...holds.map((h) => ({ startsAt: h.offeredStartsAt!, physioId: h.offeredPhysioId! })),
  ];
  // Holiday.date é coluna DATE: a parte UTC já é o dia civil
  return { busy, holidayKeys: new Set(holidays.map((h) => h.date.toISOString().slice(0, 10))) };
}

export type Slot = { startsAt: Date; physioIds: string[]; peak: boolean };

export async function availableSlots(unitId: string, from: Date, days: number, physioId?: string, db: Db = prisma): Promise<Slot[]> {
  const unit = await getUnit(unitId);
  if (!unit) throw notFound("Unidade");
  const to = new Date(from.getTime() + days * DAY);
  const { busy, holidayKeys } = await occupancy(unitId, from, to, db);
  const ids = unit.physios.map((p) => p.id).filter((id) => !physioId || id === physioId);

  const slots: Slot[] = [];
  const first = startOfRecifeDay(from);
  for (let i = 0; i <= days; i++) {
    const date = new Date(first.getTime() + i * DAY);
    const p = recifeParts(date);
    if (holidayKeys.has(dayKey(date))) continue;
    for (const hour of hoursForDay(unit, p.weekday)) {
      const startsAt = atRecife(p.year, p.month, p.day, hour);
      if (startsAt <= from || startsAt >= to) continue;
      const free = freePhysiosAt(startsAt, ids, busy, unit.chairs);
      if (free.length) slots.push({ startsAt, physioIds: free, peak: isPeakHour(hour) });
    }
  }
  return slots;
}

/** Disponibilidade típica por dia da semana e hora nas próximas 5 semanas, para o wizard. */
export async function weekGrid(unitId: string, physioId?: string) {
  const unit = await getUnit(unitId);
  if (!unit) throw notFound("Unidade");
  const now = new Date();
  const slots = await availableSlots(unitId, now, 35, physioId);
  const count = new Map<string, number>();
  for (const s of slots) {
    const p = recifeParts(s.startsAt);
    const key = `${p.weekday}-${p.hour}`;
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  const days = [1, 2, 3, 4, 5, 6].filter((w) => hoursForDay(unit, w).length).map((weekday) => ({
    weekday,
    hours: hoursForDay(unit, weekday).map((hour) => {
      const free = count.get(`${weekday}-${hour}`) ?? 0;
      return { hour, peak: isPeakHour(hour), level: free >= 4 ? "alta" : free >= 2 ? "media" : free === 1 ? "baixa" : "nenhuma" };
    }),
  }));
  return { days, saturdayEnabled: unit.saturdayEnabled };
}

export type BookInput = { patientId: string; unitId: string; physioId?: string; pattern: WeeklySlot[]; count: number };

/** Novo pacote ou sessão avulsa. Com tratamento em andamento, as sessões entram nele; senão, abre um novo. */
export async function bookTreatment(input: BookInput, actorId: string) {
  const patient = await findPatient(input.patientId);
  if (!patient) throw notFound("Paciente");
  const unit = await getUnit(input.unitId);
  if (!unit) throw notFound("Unidade");
  for (const s of input.pattern)
    if (!hoursForDay(unit, s.weekday).includes(s.hour)) throw badRequest("Um dos horários escolhidos não existe nesta unidade.");
  const candidates = input.physioId ? [input.physioId] : unit.physios.map((p) => p.id);
  if (input.physioId && !unit.physios.some((p) => p.id === input.physioId)) throw notFound("Fisioterapeuta");
  const { count } = input;

  const result = await withSlotLock(input.unitId, async (tx) => {
    const active = await findActiveTreatment(input.patientId, tx);
    const now = new Date();
    const { busy, holidayKeys } = await occupancy(input.unitId, now, new Date(now.getTime() + WEEKS_AHEAD * 7 * DAY), tx);
    const ownSlots = new Set((await patientActiveTimes(input.patientId, tx)).map((s) => s.startsAt.getTime()));

    // Depois da última sessão marcada, para o pacote novo não se misturar ao atual
    const from = active ? new Date(Math.max(now.getTime(), ...ownSlots)) : now;
    // Mesma fisioterapeuta do início ao fim: escolhe quem termina o plano mais cedo
    const plans = candidates
      .map((physioId) => ({
        physioId,
        dates: planSessions(input.pattern, from, count, (d) =>
          !holidayKeys.has(dayKey(d)) && !ownSlots.has(d.getTime()) && freePhysiosAt(d, [physioId], busy, unit.chairs).length > 0),
      }))
      .filter((p) => p.dates.length === count)
      .sort((a, b) => a.dates[count - 1].getTime() - b.dates[count - 1].getTime());
    const plan = plans[0];
    if (!plan) throw conflict("Não há vagas suficientes nesses horários. Tente outra combinação.");

    const isInsurance = patient.type === "CONVENIO";
    const treatment = active ?? await createTreatment(
      { patientId: patient.id, unitId: input.unitId, physioId: plan.physioId, totalSessions: count }, tx,
    );
    const offset = active ? active.totalSessions : 0;
    if (active) await extendTreatment(active.id, count, tx);

    const payment = isInsurance ? null : await createPayment(tx, {
      patientId: patient.id, treatmentId: treatment.id, createdTreatment: !active, sessionCount: count, actorId,
    });
    await createSessions(
      plan.dates.map((startsAt, i) => ({
        treatmentId: treatment.id, patientId: patient.id, unitId: input.unitId, physioId: plan.physioId,
        number: offset + i + 1, startsAt, paymentId: payment?.id,
        // Convênio: além do lote já autorizado, depende de nova guia
        provisional: isInsurance && (!!active || i + 1 > AUTHORIZED_BATCH),
      })),
      tx,
    );
    if (isInsurance && !active) await createRenewal({ treatmentId: treatment.id }, tx);
    // Sessões extras reabrem a renovação, que volta para a fila da recepção
    if (isInsurance && active) await reopenRenewal(treatment.id, tx);

    await audit(actorId, "TRATAMENTO_CRIADO", "Treatment", treatment.id, { unit: unit.code, sessoes: count }, tx);
    await notify(patient.userId, payment ? {
      type: "PAGAMENTO", title: "Falta só o pagamento",
      body: `Reservamos ${count === 1 ? "sua sessão" : `suas ${count} sessões`} em ${unit.name} até concluir o PIX.`, href: `/app/pagamento/${payment.id}`,
    } : {
      type: "TRATAMENTO", title: "Seu agendamento foi feito",
      body: `Reservamos ${count === 1 ? "sua sessão" : `suas ${count} sessões`} em ${unit.name}. Acompanhe em Meu tratamento.`, href: "/app",
    }, tx);
    return { treatmentId: treatment.id, firstSession: plan.dates[0], lastSession: plan.dates[count - 1], paymentId: payment?.id ?? null, count };
  });
  return result;
}

/** Recepção recebeu um PIX depois do prazo: devolve a reserva se os mesmos horários continuam livres. */
export async function reactivatePayment(id: string, user: CurrentUser) {
  const p = await payments.findPayment(id);
  if (!p) throw notFound("Pagamento");
  if (p.status !== "EXPIRADO") throw conflict("Só uma reserva expirada pode ser reativada.");
  const record = await payments.expiryRecord(id);
  const slots = (record?.sessoes ?? []).map((s) => ({ ...s, startsAt: new Date(s.startsAt) }));
  if (!slots.length) throw conflict("Não há registro dos horários desta reserva. Agende de novo pelo paciente.");
  const { unitId, physioId } = slots[0];
  await assertDeskAccess(user, unitId, physioId);
  const unit = await getUnit(unitId);
  if (!unit) throw notFound("Unidade");
  const now = new Date();
  if (slots[0].startsAt <= now) throw conflict("O primeiro horário desta reserva já passou. Agende de novo pelo paciente.");

  await withSlotLock(unitId, async (tx) => {
    const { busy } = await occupancy(unitId, now, new Date(slots[slots.length - 1].startsAt.getTime() + 1), tx);
    if (slots.some((s) => !freePhysiosAt(s.startsAt, [s.physioId], busy, unit.chairs).length))
      throw conflict("Algum desses horários já foi ocupado. Agende de novo pelo paciente.");
    // Como no agendamento: entra no tratamento em andamento; se a expiração o apagou, abre outro
    const reuse = await findActiveTreatment(p.patientId, tx);
    const treatment = reuse ?? await createTreatment({ patientId: p.patientId, unitId, physioId, totalSessions: slots.length }, tx);
    if (reuse) await extendTreatment(reuse.id, slots.length, tx);
    const offset = reuse ? reuse.totalSessions : 0;
    await createSessions(slots.map((s, i) => ({
      treatmentId: treatment.id, patientId: p.patientId, unitId, physioId: s.physioId, number: offset + i + 1, startsAt: s.startsAt, paymentId: id,
    })), tx);
    const cfg = await getSettings();
    if (!(await payments.reactivatePayment(id, { treatmentId: treatment.id, createdTreatment: !reuse, expiresAt: new Date(Date.now() + cfg.pix_hold_minutes * 60_000) }, tx)))
      throw conflict("Esta reserva já foi reativada.");
    await audit(user.id, "PAGAMENTO_REATIVADO", "Payment", id, undefined, tx);
  });
}

/** Unidades com os próximos horários: tela "Unidades". */
export async function unitsOverview() {
  const units = await listUnits();
  const now = new Date();
  return Promise.all(
    units.map(async (u) => {
      const slots = await availableSlots(u.id, now, 7);
      return {
        id: u.id, code: u.code, name: u.name, address: u.address, phone: u.phone, lat: u.lat, lng: u.lng,
        openHour: u.openHour, closeHour: u.closeHour, saturdayEnabled: u.saturdayEnabled, satOpenHour: u.satOpenHour, satCloseHour: u.satCloseHour,
        physios: u.physios.map((p) => ({ id: p.id, name: p.user.name })),
        slots: slots.slice(0, 12).map((s) => ({ startsAt: s.startsAt, peak: s.peak })),
        totalFree: slots.length,
      };
    }),
  );
}

