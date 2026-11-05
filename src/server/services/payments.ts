import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { fmtLong, fmtStamp, fmtTime } from "@/lib/time";
import type { CurrentUser } from "../auth/session";
import { prisma } from "../db";
import { AppError, conflict, forbidden, notFound } from "../errors";
import { paymentProvider } from "../payments";
import { audit, getSettings } from "../repositories/config";
import * as repo from "../repositories/payments";
import { assertDeskAccess, deskScope } from "./access";
import { notify } from "./notifications";
import { offerFreedSlot } from "./waitlist";

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const receiptCode = (txid: string) => `MV-${txid.slice(0, 10)}`;

const description = (count: number) => `Fisioterapia: ${count} ${count === 1 ? "sessão" : "sessões"}`;

/** Roda dentro da transação do agendamento: reserva e cobrança nascem juntas. */
export async function createPayment(
  tx: Prisma.TransactionClient,
  input: { patientId: string; treatmentId: string; createdTreatment: boolean; sessionCount: number; actorId: string },
) {
  const cfg = await getSettings();
  const amountCents = Math.round(cfg.price_particular * 100) * input.sessionCount;
  const txid = randomBytes(12).toString("hex").toUpperCase();
  const provider = paymentProvider();
  await provider.createCharge({ txid, amountCents, description: description(input.sessionCount) });
  const { actorId, ...data } = input;
  const payment = await repo.createPayment({
    ...data, amountCents, txid, provider: provider.name, expiresAt: new Date(Date.now() + cfg.pix_hold_minutes * 60_000),
  }, tx);
  await audit(actorId, "PAGAMENTO_CRIADO", "Payment", payment.id, { valor: amountCents, sessoes: input.sessionCount }, tx);
  return payment;
}

export async function paymentView(id: string, patientId: string | null) {
  await expirePayments();
  const p = await repo.findPayment(id);
  if (!p || (patientId && p.patientId !== patientId)) throw notFound("Pagamento");
  const provider = paymentProvider();
  const waiting = p.status === "AGUARDANDO";
  const pixCode = waiting ? await provider.pixCode({ txid: p.txid, amountCents: p.amountCents, description: description(p.sessionCount) }) : null;
  return {
    id: p.id, status: p.status, amountCents: p.amountCents, sessionCount: p.sessionCount, unitPriceCents: p.amountCents / p.sessionCount,
    expiresAt: p.expiresAt, paidAt: p.paidAt, createdAt: p.createdAt, automatic: provider.automatic,
    receipt: p.status === "PAGO" ? receiptCode(p.txid) : null, pixCode,
    qr: pixCode ? await QRCode.toDataURL(pixCode, { margin: 1, width: 280, errorCorrectionLevel: "M" }) : null,
  };
}

async function markPaid(id: string, actorId: string | null) {
  const p = await repo.findPayment(id);
  if (!p) throw notFound("Pagamento");
  // Condicional: confirmação e expiração podem acontecer ao mesmo tempo, e só uma vence
  if (!(await repo.settlePayment(id, actorId))) {
    if (p.status === "PAGO") throw conflict("Este pagamento já foi confirmado.");
    throw new AppError(409, "PAGAMENTO_EXPIRADO", `A reserva venceu às ${fmtTime(p.expiresAt)} e os horários foram liberados. Se ainda estiverem livres, você pode reativá-la.`);
  }
  const paidAt = new Date();
  await audit(actorId, "PAGAMENTO_CONFIRMADO", "Payment", id, { modo: actorId ? "manual" : "automatico", valor: p.amountCents, sessoes: p.sessionCount });
  await notify(p.patient.userId, {
    type: "PAGAMENTO", title: "Pagamento confirmado",
    body: `Comprovante ${receiptCode(p.txid)}\nValor: ${brl(p.amountCents)}\nSessões: ${p.sessionCount}\nData: ${fmtStamp(paidAt)}\nClínica Movimento. Suas sessões estão reservadas.`,
    href: `/app/pagamento/${id}`,
  });
}

export async function confirmManually(id: string, user: CurrentUser) {
  await expirePayments();
  const first = await repo.firstSessionOf(id);
  if (first) await assertDeskAccess(user, first.unitId, first.physioId);
  return markPaid(id, user.id);
}

/** Recusa pela equipe: solta os horários na hora (como a expiração) e avisa o paciente, com o motivo se houver. */
export async function rejectPayment(id: string, user: CurrentUser, reason?: string) {
  await expirePayments();
  const first = await repo.firstSessionOf(id);
  if (first) await assertDeskAccess(user, first.unitId, first.physioId);
  const p = await repo.paymentForRelease(id);
  if (!p) throw notFound("Pagamento");
  const released = await prisma.$transaction(async (tx) => {
    if (!(await repo.expirePayment(id, tx, "RECUSADO"))) return null;
    const freed = await repo.deleteUnpaidSessions(id, tx);
    if (p.treatmentId) await repo.releaseTreatment(p.treatmentId, p.sessionCount, tx);
    await audit(user.id, "PAGAMENTO_RECUSADO", "Payment", id, { motivo: reason ?? null, valor: p.amountCents, sessoes: freed.map((s) => ({ ...s, startsAt: s.startsAt.toISOString() })) }, tx);
    return freed;
  });
  if (!released) throw conflict(p.status === "PAGO" ? "Este pagamento já foi confirmado." : "Esta reserva não está mais aguardando pagamento.");
  await notify(p.patient.userId, {
    type: "PAGAMENTO", title: "Pagamento não confirmado",
    body: `A clínica não confirmou o pagamento da sua reserva, e os horários foram liberados.${reason ? `
Motivo: ${reason}` : ""}
Você pode agendar de novo quando quiser.`,
    href: "/app/agendar",
  });
  for (const s of released) await offerFreedSlot(s.unitId, s.startsAt, s.physioId);
}

/** Sem pagamento autorizado, nada do tratamento completo responde: vale para a tela e para quem chama a API direto. */
export async function assertTreatmentUnlocked(patientId: string) {
  const t = await repo.latestTreatmentId(patientId);
  if (t && (await repo.awaitingPaymentOf(t)))
    throw new AppError(403, "PAGAMENTO_PENDENTE", "Seu tratamento é liberado assim que a clínica confirmar o pagamento.");
}

/** Webhook do PSP: só um provedor automático devolve txid aqui. */
export async function handleWebhook(rawBody: string, signature: string | null) {
  const provider = paymentProvider();
  if (!provider.automatic) throw new AppError(404, "ROTA", "Provedor automático não configurado.");
  const txid = provider.parseWebhook(rawBody, signature);
  if (!txid) throw forbidden();
  const p = await repo.findByTxid(txid);
  if (!p) throw notFound("Pagamento");
  if (p.status === "AGUARDANDO") await markPaid(p.id, null);
}

type Released = Awaited<ReturnType<typeof repo.expiredPayments>>[number] & { freed: { unitId: string; startsAt: Date; physioId: string }[] };

/**
 * Expiração preguiçosa: quem lista pagamentos ou reserva horários chama isto na própria transação,
 * então a reserva vence na hora certa sem depender do cron. As sessões nunca pagas são apagadas para não sujar as métricas.
 */
export async function releaseExpired(tx: Prisma.TransactionClient): Promise<Released[]> {
  const released: Released[] = [];
  for (const p of await repo.expiredPayments(tx)) {
    // Condicional: com duas transações vendo o mesmo vencido, só uma libera
    if (!(await repo.expirePayment(p.id, tx))) continue;
    const freed = await repo.deleteUnpaidSessions(p.id, tx);
    if (p.treatmentId) await repo.releaseTreatment(p.treatmentId, p.sessionCount, tx);
    await audit(null, "PAGAMENTO_EXPIRADO", "Payment", p.id, { sessoes: freed.map((s) => ({ ...s, startsAt: s.startsAt.toISOString() })) }, tx);
    released.push({ ...p, freed });
  }
  return released;
}

/** Avisos depois do commit: paciente sabe que perdeu a reserva e a fila de espera recebe a vaga. */
export async function announceReleased(released: Released[]) {
  for (const p of released) {
    await notify(p.patient.userId, {
      type: "PAGAMENTO", title: "Reserva expirada",
      body: `Não recebemos o pagamento a tempo, e o horário de ${fmtLong(p.freed[0]?.startsAt ?? new Date())} foi liberado. Você pode agendar de novo quando quiser.`,
      href: "/app/agendar",
    });
    for (const s of p.freed) await offerFreedSlot(s.unitId, s.startsAt, s.physioId);
  }
}

export const expirePayments = async () => announceReleased(await prisma.$transaction(releaseExpired));

export async function patientPayments(patientId: string) {
  await expirePayments();
  return repo.patientPayments(patientId);
}

export async function pendingPayments(user: CurrentUser) {
  await expirePayments();
  const scope = await deskScope(user);
  return scope ? repo.pendingPayments(scope) : [];
}
