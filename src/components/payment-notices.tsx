"use client";

import { CircleAlert, QrCode, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LinkButton } from "./ui";

// Dispensa por pagamento, no próprio navegador: o aviso não volta ao trocar de aba nem ao recarregar
const expiredKey = (id: string) => `mv-aviso-reserva:${id}`;
export const pendingKey = (id: string) => `mv-pix-oculto:${id}`;

function read(key: string) {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}
function write(key: string, on: boolean) {
  try { if (on) localStorage.setItem(key, "1"); else localStorage.removeItem(key); } catch { /* armazenamento bloqueado */ }
}

/** null até ler o navegador: um aviso já fechado não pisca na tela. */
function useDismissed(key: string) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage só existe depois da hidratação
  useEffect(() => setDismissed(read(key)), [key]);
  return [dismissed, () => { write(key, true); setDismissed(true); }] as const;
}

function CloseButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="-my-2 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 hover:text-ink">
      <X strokeWidth={1.5} className="size-4" />
    </button>
  );
}

export function ExpiredNotice({ id, cta = true }: { id: string; cta?: boolean }) {
  const [dismissed, dismiss] = useDismissed(expiredKey(id));
  if (dismissed !== false) return null;
  return (
    <div role="status" className="card flex flex-wrap items-center gap-3 border-danger/40 p-4">
      <CircleAlert strokeWidth={1.5} className="size-5 shrink-0 text-danger" />
      <p className="min-w-0 flex-1 basis-56 text-sm"><b className="font-semibold">Sua reserva expirou.</b> O prazo terminou e o horário foi liberado. Nenhuma cobrança foi feita.</p>
      <div className="flex items-center gap-2">
        {cta && <LinkButton variant="line" href="/app/agendar" onClick={dismiss}>Agendar de novo</LinkButton>}
        <CloseButton onClick={dismiss} label="Fechar aviso de reserva expirada" />
      </div>
    </div>
  );
}

export function PendingPaymentNotice({ id }: { id: string }) {
  const [dismissed, dismiss] = useDismissed(pendingKey(id));
  if (dismissed !== false) return null;
  return (
    <div className="card flex items-center gap-3 border-warn/40 p-4">
      <Link href={`/app/pagamento/${id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <QrCode strokeWidth={1.5} className="size-5 shrink-0 text-warn" />
        <span className="text-sm"><b className="font-semibold">Pagamento pendente.</b> Conclua o PIX para garantir sua reserva.</span>
      </Link>
      <CloseButton onClick={dismiss} label="Fechar aviso de pagamento pendente" />
    </div>
  );
}

/** Abrir o pagamento traz o aviso de volta na tela inicial. */
export const restorePendingNotice = (id: string) => write(pendingKey(id), false);
