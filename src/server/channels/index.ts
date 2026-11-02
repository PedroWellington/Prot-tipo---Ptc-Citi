import nodemailer, { type Transporter } from "nodemailer";
import { renderEmail } from "./email-template";

export type Message = {
  to: string;
  subject: string;
  text: string;
  actions?: { label: string; url: string }[];
  /** Respostas rápidas. O id volta na resposta do paciente. */
  buttons?: { id: string; label: string }[];
  /** Template aprovado pela Meta, obrigatório fora da janela de 24h. */
  template?: string;
};

export interface MessageChannel {
  readonly name: string;
  readonly enabled: boolean;
  /** Devolve o id externo da mensagem, quando o canal tem um. */
  send(message: Message): Promise<string | void>;
}

let transport: Transporter | undefined;
const mailer = () =>
  (transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  }));

export const emailChannel: MessageChannel = {
  name: "email",
  enabled: true,
  async send({ to, subject, text, actions }) {
    await mailer().sendMail({ from: process.env.SMTP_FROM, to, subject, text, html: renderEmail(subject, text, actions) });
  },
};

/**
 * API oficial do WhatsApp (Cloud API da Meta). Desativada até WHATSAPP_ENABLED=true.
 * Exige conta WhatsApp Business, número verificado e templates aprovados.
 * `to` em E.164 sem "+". As respostas chegam em /api/webhooks/whatsapp.
 */
export const whatsAppCloudChannel: MessageChannel = {
  name: "whatsapp-cloud",
  enabled: process.env.WHATSAPP_ENABLED === "true",
  async send({ to, subject, text, buttons, template }) {
    const content = template
      ? {
          type: "template",
          template: {
            name: template, language: { code: "pt_BR" },
            components: [
              { type: "body", parameters: [{ type: "text", text }] },
              ...(buttons ?? []).map((b, index) => ({ type: "button", sub_type: "quick_reply", index, parameters: [{ type: "payload", payload: b.id }] })),
            ],
          },
        }
      : buttons?.length
        ? {
            type: "interactive",
            interactive: {
              type: "button", body: { text },
              action: { buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.label.slice(0, 20) } })) },
            },
          }
        : { type: "text", text: { body: `${subject}\n\n${text}` } };
    const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, ...content }),
    });
    if (!res.ok) throw new Error(`WhatsApp respondeu ${res.status}`);
    return ((await res.json()) as { messages?: { id: string }[] }).messages?.[0]?.id;
  },
};

/** Demonstração: nada sai da máquina. A mensagem fica na "Caixa do WhatsApp (simulação)" da recepção. */
export const whatsAppSimulatedChannel: MessageChannel = {
  name: "whatsapp-simulado",
  enabled: true,
  async send() {},
};
