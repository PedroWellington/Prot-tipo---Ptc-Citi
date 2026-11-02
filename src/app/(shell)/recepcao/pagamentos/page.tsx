"use client";

import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { useAction } from "@/components/providers";
import { Badge, Button, Empty, ErrorState, ListSkeleton, PageTitle } from "@/components/ui";
import { api } from "@/lib/api";
import { formatPhone } from "@/lib/labels";
import { q, type PendingPayment } from "@/lib/queries";
import { fmtTime } from "@/lib/time";

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Page() {
  const { data, isLoading, error, refetch } = useQuery(q.deskPayments);
  const confirm = useAction({
    run: (id: string) => api(`/desk/payments/${id}/confirm`, { body: {} }),
    optimistic: { key: q.deskPayments.queryKey, update: (old: PendingPayment[], id: string) => old.filter((p) => p.id !== id) },
    success: "Pagamento confirmado. O recibo foi enviado ao paciente.",
  });
  return (
    <>
      <PageTitle eyebrow="PIX" title="Pagamentos" />
      <p className="-mt-3 mb-5 flex gap-2 text-sm text-ink-2"><Info strokeWidth={1.5} className="size-4 shrink-0" />Sem provedor conectado, o sistema não vê o banco: confira o recebimento no extrato antes de confirmar.</p>
      {isLoading && <ListSkeleton />}
      {error && <ErrorState error={error} retry={refetch} />}
      {data && !data.length && <div className="card"><Empty title="Nada pendente" body="Pagamentos aguardando confirmação aparecem aqui." /></div>}
      {!!data?.length && (
        <ul className="card divide-y divide-line overflow-hidden">
          {data.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate font-medium">{p.patient.user.name}</p>
                <p className="text-sm text-ink-3">{p.sessionCount} {p.sessionCount === 1 ? "sessão" : "sessões"} · {formatPhone(p.patient.phone)}</p>
              </div>
              <span className="font-display text-2xl tabular-nums">{brl(p.amountCents)}</span>
              <Badge tone="warn">Reservado até {fmtTime(p.expiresAt)}</Badge>
              <Button onClick={() => confirm.mutate(p.id)}>Confirmar pagamento</Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
