import { createHmac, timingSafeEqual } from "node:crypto";
import { buildPixPayload } from "@/lib/pix";

export type Charge = { txid: string; amountCents: number; description: string };

export interface PaymentProvider {
  readonly name: string;
  /** false = sem aviso do banco: a recepção confirma manualmente. */
  readonly automatic: boolean;
  /** Registra a cobrança no provedor, quando ele exige. */
  createCharge(charge: Charge): Promise<void>;
  /** Código copia e cola. Recalculado a cada consulta, para não guardar nada no banco. */
  pixCode(charge: Charge): Promise<string>;
  /** Valida a assinatura do webhook e devolve o txid pago, ou null se não for um pagamento. */
  parseWebhook(rawBody: string, signature: string | null): string | null;
}

function pixEnv() {
  const { PIX_KEY: key, PIX_MERCHANT_NAME: merchantName, PIX_MERCHANT_CITY: merchantCity } = process.env;
  if (!key || !merchantName || !merchantCity) throw new Error("Configure PIX_KEY, PIX_MERCHANT_NAME e PIX_MERCHANT_CITY");
  return { key, merchantName, merchantCity };
}

export const staticPixProvider: PaymentProvider = {
  name: "pix-estatico",
  automatic: false,
  async createCharge() { pixEnv(); },
  async pixCode({ txid, amountCents }) {
    return buildPixPayload({ ...pixEnv(), amountCents, txid });
  },
  parseWebhook: () => null,
};

/**
 * Adaptador para PSP (Mercado Pago, Efí, Asaas...). Desativado até PIX_PROVIDER=psp.
 * Cada provedor tem seu contrato: ajuste os dois fetch e o formato do webhook ao contratar.
 * Assinatura esperada no cabeçalho x-webhook-signature: HMAC-SHA256 hex do corpo com PSP_WEBHOOK_SECRET.
 */
export const pspPixProvider: PaymentProvider = {
  name: "pix-psp",
  automatic: true,
  async createCharge({ txid, amountCents, description }) {
    const res = await fetch(`${process.env.PSP_BASE_URL}/charges`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.PSP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ txid, amount: amountCents / 100, description }),
    });
    if (!res.ok) throw new Error(`PSP respondeu ${res.status}`);
  },
  async pixCode({ txid }) {
    const res = await fetch(`${process.env.PSP_BASE_URL}/charges/${txid}`, { headers: { Authorization: `Bearer ${process.env.PSP_TOKEN}` } });
    if (!res.ok) throw new Error(`PSP respondeu ${res.status}`);
    return ((await res.json()) as { pixCopiaECola: string }).pixCopiaECola;
  },
  parseWebhook(rawBody, signature) {
    const secret = process.env.PSP_WEBHOOK_SECRET;
    if (!secret || !signature) return null;
    const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
    const event = JSON.parse(rawBody) as { status?: string; txid?: string };
    return event.status === "PAID" ? (event.txid ?? null) : null;
  },
};

export const paymentProvider = (): PaymentProvider => (process.env.PIX_PROVIDER === "psp" ? pspPixProvider : staticPixProvider);
