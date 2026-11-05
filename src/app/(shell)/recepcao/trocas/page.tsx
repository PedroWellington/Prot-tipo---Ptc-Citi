"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { useState } from "react";
import { Sheet } from "@/components/lazy-sheet";
import { useAction } from "@/components/providers";
import { leave } from "@/lib/motion";
import { Badge, Button, Card, Empty, ErrorState, Input, ListSkeleton, PageTitle } from "@/components/ui";
import { api } from "@/lib/api";
import { q } from "@/lib/queries";
import { fmtTime, fmtWeekShort } from "@/lib/time";
import type { requestQueue } from "@/server/services/reschedule";

type Item = Awaited<ReturnType<typeof requestQueue>>[number];
const KEY = ["desk-requests"];

export default function Page() {
  const { data, isLoading, error, refetch } = useQuery(q.deskRequests);
  const [rejecting, setRejecting] = useState<Item | null>(null);
  const remove = (old: Item[], id: string) => old.filter((r) => r.id !== id);
  const approve = useAction({
    run: (id: string) => api(`/desk/requests/${id}/approve`, { body: {} }),
    optimistic: { key: KEY, update: remove }, success: "Troca aprovada",
  });
  const reject = useAction({
    run: ({ id, ...body }: { id: string; response: string; suggestion?: string }) => api(`/desk/requests/${id}/reject`, { body }),
    optimistic: { key: KEY, update: (old: Item[], v: { id: string }) => remove(old, v.id) }, success: "Paciente avisado",
  });

  return (
    <>
      <PageTitle eyebrow="Fila" title="Solicitações de troca" />
      {isLoading && <ListSkeleton />}
      {error && <ErrorState error={error} retry={refetch} />}
      {data && !data.length && <div className="card"><Empty title="Fila em dia" body="Nenhuma solicitação aguardando resposta." /></div>}
      <div className="stagger grid items-start gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {data?.map((r) => (
          <Card key={r.id} data-leave>
            <div className="flex items-center justify-between gap-3">
              <h2 className="truncate font-semibold">{r.patient.user.name}</h2>
              {r.conflict ? <Badge tone="danger"><AlertTriangle className="size-3.5" />Conflito</Badge> : <Badge tone="ok">Horário livre</Badge>}
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink-2">{fmtWeekShort(r.session.startsAt)} {fmtTime(r.session.startsAt)} · {r.session.unit.name}</span>
              <ArrowRight strokeWidth={1.5} className="size-4 text-ink-3" />
              <b className="font-semibold">{fmtWeekShort(r.targetStartsAt)} {fmtTime(r.targetStartsAt)} · {r.targetUnit.name}</b>
            </p>
            {r.reason && <p className="mt-1 text-sm text-ink-3">“{r.reason}”</p>}
            {!!r.alternatives.length && (
              <p className="mt-2 text-sm text-ink-2">Alternativas: {r.alternatives.map((a) => `${fmtWeekShort(a)} ${fmtTime(a)}`).join(" · ")}</p>
            )}
            <div className="mt-3 flex gap-2">
              <Button className="flex-1" disabled={r.conflict} onClick={(e) => leave(e.currentTarget, () => approve.mutate(r.id))}>Aprovar</Button>
              <Button variant="line" className="flex-1" onClick={() => setRejecting(r)}>Recusar</Button>
            </div>
          </Card>
        ))}
      </div>
      <Sheet open={!!rejecting} onClose={() => setRejecting(null)} title="Recusar solicitação">
        <form key={rejecting?.id} className="flex flex-col gap-4" onSubmit={(e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget)) as { response: string; suggestion: string };
          reject.mutate({ id: rejecting!.id, ...f });
          setRejecting(null);
        }}>
          <Input label="Justificativa" name="response" required defaultValue="Esse horário não está disponível." />
          <Input label="Sugestão de alternativa" name="suggestion"
            defaultValue={rejecting?.alternatives[0] ? `${fmtWeekShort(rejecting.alternatives[0])} às ${fmtTime(rejecting.alternatives[0])}` : ""} />
          <Button type="submit" className="w-full">Enviar resposta</Button>
        </form>
      </Sheet>
    </>
  );
}
