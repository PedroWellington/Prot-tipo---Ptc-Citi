"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Sheet } from "@/components/lazy-sheet";
import { useAction } from "@/components/providers";
import { Badge, Button, Card, Empty, ErrorState, Input, ListSkeleton, PageTitle, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { q } from "@/lib/queries";
import { RENEWAL_LABEL } from "@/lib/labels";
import { fmtDate } from "@/lib/time";
import type { renewalQueue } from "@/server/repositories/requests";

type Item = Awaited<ReturnType<typeof renewalQueue>>[number];
const KEY = ["desk-renewals"];

const NEXT: Record<string, { status: string; label: string; variant?: "primary" | "danger" | "ghost" }[]> = {
  NAO_INICIADA: [{ status: "SOLICITADA", label: "Marcar como solicitada" }],
  SOLICITADA: [{ status: "EM_ANALISE", label: "Em análise", variant: "ghost" }, { status: "LIBERADA", label: "Liberada" }, { status: "NEGADA", label: "Negada", variant: "danger" }],
  EM_ANALISE: [{ status: "LIBERADA", label: "Liberada" }, { status: "NEGADA", label: "Negada", variant: "danger" }],
  NEGADA: [],
};

export default function Page() {
  const { data, isLoading, error, refetch } = useQuery(q.deskRenewals);
  const [editing, setEditing] = useState<{ item: Item; status: string } | null>(null);
  const update = useAction({
    run: ({ id, ...body }: { id: string; status: string; note?: string; expectedAt?: string }) => api(`/desk/renewals/${id}`, { method: "PATCH", body }),
    optimistic: {
      key: KEY,
      update: (old: Item[], v: { id: string; status: string }) =>
        v.status === "LIBERADA" ? old.filter((r) => r.id !== v.id) : old.map((r) => (r.id === v.id ? { ...r, status: v.status as Item["status"] } : r)),
    },
    success: "Status atualizado e paciente avisado",
  });
  const release = useAction({
    run: (id: string) => api<{ released: number }>(`/desk/renewals/${id}/release`, { body: {} }),
    invalidate: [KEY], success: "Horários liberados",
  });

  return (
    <>
      <PageTitle eyebrow="Convênios" title="Renovações" />
      <p className="-mt-3 mb-5 text-sm text-ink-2">Prioridade para quem está da 3ª à 5ª sessão. O preenchimento no portal do convênio continua manual.</p>
      {isLoading && <ListSkeleton />}
      {error && <ErrorState error={error} retry={refetch} />}
      {data && !data.length && <div className="card"><Empty title="Nenhuma renovação pendente" /></div>}
      <div className="grid items-start gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {data?.map((r) => {
          const done = r.treatment.completedSessions;
          const urgent = done >= 3 && done <= 5;
          return (
            <Card key={r.id} className={urgent && r.status === "NAO_INICIADA" ? "border-warn/50" : undefined}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="truncate font-semibold">{r.treatment.patient.user.name}</h2>
                <Badge tone={r.status === "NEGADA" ? "danger" : urgent ? "warn" : "neutral"}>Sessão {done} de {r.treatment.totalSessions}</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-2">{r.treatment.patient.insurer} · carteirinha {r.treatment.patient.cardNumber} · {r.treatment.unit.name}</p>
              <p className="mt-1 text-sm">
                <span className="text-ink-3">Status: </span>{RENEWAL_LABEL[r.status]}
                {r.expectedAt && <span className="text-ink-3"> · previsão {fmtDate(r.expectedAt)}</span>}
              </p>
              {r.note && <p className="mt-1 text-sm text-ink-2">{r.note}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {NEXT[r.status].map((n) => <Button key={n.status} variant={n.variant} className="flex-1" onClick={() => setEditing({ item: r, status: n.status })}>{n.label}</Button>)}
                {r.status === "NEGADA" && <Button variant="danger" className="flex-1" loading={release.isPending} onClick={() => release.mutate(r.id)}>Liberar horários guardados</Button>}
              </div>
            </Card>
          );
        })}
      </div>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? RENEWAL_LABEL[editing.status] : ""}>
        <form key={editing?.status} className="flex flex-col gap-4" onSubmit={(e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget)) as { note: string; expectedAt: string };
          update.mutate({ id: editing!.item.id, status: editing!.status, note: f.note || undefined, expectedAt: f.expectedAt ? new Date(f.expectedAt).toISOString() : undefined });
          setEditing(null);
        }}>
          {editing?.status === "SOLICITADA" && <Input label="Previsão de resposta" name="expectedAt" type="date" hint="Se vazio, usamos o prazo padrão dos parâmetros." />}
          <Textarea label="Observação ou nº do protocolo" name="note" maxLength={500} />
          <Button type="submit" className="w-full">Salvar</Button>
        </form>
      </Sheet>
    </>
  );
}
