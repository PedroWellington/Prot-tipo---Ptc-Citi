import type { Prisma } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";
import { whatsAppCloudChannel, whatsAppSimulatedChannel } from "../channels";
import { prisma } from "../db";
import { conflict, notFound } from "../errors";

export type WhatsAppButton = { id: string; label: string };
export type Outgoing = {
  userId?: string; contact: string; phone: string; text: string;
  buttons?: WhatsAppButton[]; kind: string; refId?: string; template?: string;
};

export const usingCloud = () => whatsAppCloudChannel.enabled;

/** Toda mensagem vira uma linha: é o histórico e, no modo simulado, a própria entrega. */
export async function sendWhatsApp({ template, ...m }: Outgoing) {
  const channel = usingCloud() ? whatsAppCloudChannel : whatsAppSimulatedChannel;
  const row = await prisma.whatsAppMessage.create({
    data: { ...m, buttons: m.buttons as Prisma.InputJsonValue | undefined, simulated: !usingCloud() },
  });
  const externalId = await channel.send({
    to: m.phone, subject: "Clínica Movimento", text: m.text, template,
    buttons: m.buttons?.map((b) => ({ id: `${row.id}:${b.id}`, label: b.label })),
  });
  if (externalId) await prisma.whatsAppMessage.update({ where: { id: row.id }, data: { externalId } });
}

/** Marca a resposta uma vez só e devolve o que o fluxo precisa para agir. */
export async function recordReply(messageId: string, buttonId: string) {
  const row = await prisma.whatsAppMessage.findUnique({ where: { id: messageId } });
  if (!row) throw notFound("Mensagem");
  const button = (row.buttons as WhatsAppButton[] | null)?.find((b) => b.id === buttonId);
  if (!button) throw notFound("Resposta");
  const { count } = await prisma.whatsAppMessage.updateMany({
    where: { id: messageId, repliedAt: null }, data: { repliedAt: new Date(), reply: button.label },
  });
  if (!count) throw conflict("Esta mensagem já foi respondida.");
  return { kind: row.kind, refId: row.refId, buttonId };
}

export const inbox = (take = 100) =>
  prisma.whatsAppMessage.findMany({
    orderBy: { createdAt: "desc" }, take,
    select: { id: true, contact: true, phone: true, text: true, buttons: true, kind: true, reply: true, repliedAt: true, simulated: true, createdAt: true },
  });

/** Assinatura X-Hub-Signature-256 da Meta. */
export function validMetaSignature(rawBody: string, signature: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !signature) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`);
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Extrai os ids de botão clicados do payload do webhook da Meta. */
export function repliesFromWebhook(payload: unknown): { messageId: string; buttonId: string }[] {
  const body = payload as { entry?: { changes?: { value?: { messages?: { interactive?: { button_reply?: { id?: string } }; button?: { payload?: string } }[] } }[] }[] };
  const ids = body.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages?.map((m) => m.interactive?.button_reply?.id ?? m.button?.payload) ?? []) ?? []) ?? [];
  return ids.filter((id): id is string => !!id?.includes(":")).map((id) => {
    const [messageId, buttonId] = id.split(":");
    return { messageId, buttonId };
  });
}
