import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { fmtLong, fmtStamp } from "@/lib/time";
import { prisma } from "../db";
import { AppError, conflict, forbidden, notFound } from "../errors";
import { paymentProvider } from "../payments";
import { audit, getSettings } from "../repositories/config";
import * as repo from "../repositories/payments";
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
  if (!(await repo.settlePayment(id, actorId))) throw conflict(p.status === "PAGO" ? "Este pagamento já foi confirmado." : "Este pagamento expirou. O horário foi liberado.");
  const paidAt = new Date();
  await audit(actorId, "PAGAMENTO_CONFIRMADO", "Payment", id, { modo: actorId ? "manual" : "automatico" });
  await notify(p.patient.userId, {
    type: "PAGAMENTO", title: "Pagamento confirmado",
    body: `Comprovante ${receiptCode(p.txid)}\nValor: ${brl(p.amountCents)}\nSessões: ${p.sessionCount}\nData: ${fmtStamp(paidAt)}\nClínica Movimento. Suas sessões estão reservadas.`,
    href: `/app/pagamento/${id}`,
  });
}

export const confirmManually = (id: string, actorId: string) => markPaid(id, actorId);

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

/** Cron: reserva vencida devolve os horários. As sessões nunca pagas são apagadas para não sujar as métricas. */
export async function expirePayments() {
  for (const p of await repo.expiredPayments()) {
    const freed = await prisma.$transaction(async (tx) => {
      if (!(await repo.expirePayment(p.id, tx))) return null;
      const sessions = await repo.deleteUnpaidSessions(p.id, tx);
      if (p.treatmentId) await repo.releaseTreatment(p.treatmentId, p.createdTreatment, p.sessionCount, tx);
      await audit(null, "PAGAMENTO_EXPIRADO", "Payment", p.id, undefined, tx);
      return sessions;
    });
    if (!freed) continue;
    await notify(p.patient.userId, {
      type: "PAGAMENTO", title: "Reserva expirada",
      body: `Não recebemos o pagamento a tempo, e o horário de ${fmtLong(freed[0]?.startsAt ?? new Date())} foi liberado. Você pode agendar de novo quando quiser.`,
      href: "/app/agendar",
    });
    for (const s of freed) await offerFreedSlot(s.unitId, s.startsAt, s.physioId);
  }
}

export const patientPayments = repo.patientPayments;
export const pendingPayments = repo.pendingPayments;
