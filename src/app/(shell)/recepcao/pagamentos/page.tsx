"use client";

import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { useState } from "react";
import { useAction } from "@/components/providers";
import { leave } from "@/lib/motion";
import { Badge, Button, Empty, ErrorState, Input, ListSkeleton, PageTitle } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatPhone } from "@/lib/labels";
import { q, type PendingPayment } from "@/lib/queries";
import { fmtTime, fmtWeekShort } from "@/lib/time";

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Page() {
  const { data, isLoading, error, refetch } = useQuery(q.deskPayments);
  // Confirmação que chegou depois do prazo: a recepção decide se reativa a reserva
  const [expired, setExpired] = useState<{ id: string; name: string; message: string } | null>(null);
  const confirm = useAction({
    run: (id: string) => api(`/desk/payments/${id}/confirm`, { body: {} }),
    optimistic: { key: q.deskPayments.queryKey, update: (old: PendingPayment[], id: string) => old.filter((p) => p.id !== id) },
    success: "Pagamento confirmado. O recibo foi enviado ao paciente.",
  });
  // Recusa abre um campo de motivo (opcional) na própria linha antes de confirmar
  const [rejecting, setRejecting] = useState<string | null>(null);
  const reject = useAction({
    run: ({ id, reason }: { id: string; reason: string }) => api(`/desk/payments/${id}/reject`, { body: { reason } }),
    optimistic: { key: q.deskPayments.queryKey, update: (old: PendingPayment[], v: { id: string }) => old.filter((p) => p.id !== v.id) },
    success: "Pagamento recusado. Os horários foram liberados e o paciente foi avisado.",
    onDone: () => setRejecting(null),
  });
  const reactivate = useAction({
    run: (id: string) => api(`/desk/payments/${id}/reactivate`, { body: {} }),
    invalidate: [q.deskPayments.queryKey],
    success: "Reserva reativada. Confirme o pagamento na lista.",
    onDone: () => setExpired(null),
  });
  return (
    <>
      <PageTitle eyebrow="PIX" title="Pagamentos" />
      <p className="-mt-3 mb-5 flex gap-2 text-sm text-ink-2"><Info strokeWidth={1.5} className="size-4 shrink-0" />Sem provedor conectado, o sistema não vê o banco: confira o recebimento no extrato antes de confirmar.</p>
      {expired && (
        <div role="alert" className="card mb-4 flex flex-wrap items-center gap-3 p-4">
          <p className="min-w-0 flex-1 basis-64 text-sm"><b className="font-semibold">{expired.name}:</b> {expired.message}</p>
          <Button variant="line" onClick={() => setExpired(null)}>Fechar</Button>
          <Button loading={reactivate.isPending} onClick={() => reactivate.mutate(expired.id)}>Reativar reserva</Button>
        </div>
      )}
      {isLoading && <ListSkeleton />}
      {error && <ErrorState error={error} retry={refetch} />}
      {data && !data.length && <div className="card"><Empty title="Nada pendente" body="Pagamentos aguardando confirmação aparecem aqui." /></div>}
      {!!data?.length && (
        <ul className="stagger card divide-y divide-line overflow-hidden">
          {data.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate font-medium">{p.patient.user.name}</p>
                <p className="text-sm text-ink-3">{p.sessionCount} {p.sessionCount === 1 ? "sessão" : "sessões"} · {formatPhone(p.patient.phone)}</p>
                {p.sessions[0] && <p className="text-sm text-ink-3 first-letter:uppercase">{p.sessions[0].unit.name} · 1ª sessão {fmtWeekShort(p.sessions[0].startsAt)} às {fmtTime(p.sessions[0].startsAt)}</p>}
              </div>
              <span className="font-display text-2xl tabular-nums">{brl(p.amountCents)}</span>
              <Badge tone="warn">Reservado até {fmtTime(p.expiresAt)}</Badge>
              <Button variant="line" onClick={() => setRejecting(rejecting === p.id ? null : p.id)} aria-expanded={rejecting === p.id}>Recusar pagamento</Button>
              <Button onClick={(e) => leave(e.currentTarget, () => confirm.mutate(p.id, {
                onError: (e) => { if (e instanceof ApiError && e.code === "PAGAMENTO_EXPIRADO") setExpired({ id: p.id, name: p.patient.user.name, message: e.message }); },
              }))}>Confirmar pagamento</Button>
              {rejecting === p.id && (
                <form className="flex w-full flex-wrap items-end gap-2" onSubmit={(e) => {
                  e.preventDefault();
                  reject.mutate({ id: p.id, reason: String(new FormData(e.currentTarget).get("reason") ?? "") });
                }}>
                  <div className="min-w-0 flex-1 basis-64"><Input label="Motivo (opcional, vai para o paciente)" name="reason" maxLength={300} autoFocus /></div>
                  <Button type="submit" variant="line" loading={reject.isPending}>Recusar e liberar horários</Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
