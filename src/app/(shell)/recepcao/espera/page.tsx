"use client";

import { useQuery } from "@tanstack/react-query";
import { useAction } from "@/components/providers";
import { Badge, Button, Empty, ErrorState, ListSkeleton, PageTitle } from "@/components/ui";
import { api } from "@/lib/api";
import { q } from "@/lib/queries";
import { formatPhone } from "@/lib/labels";
import { WEEKDAYS, fmtTime } from "@/lib/time";
import type { allWaitlist } from "@/server/repositories/requests";

type Item = Awaited<ReturnType<typeof allWaitlist>>[number];
const KEY = ["desk-waitlist"];

export default function Page() {
  const { data, isLoading, error, refetch } = useQuery(q.deskWaitlist);
  const remove = useAction({
    run: (id: string) => api(`/desk/waitlist/${id}`, { method: "DELETE" }),
    optimistic: { key: KEY, update: (old: Item[], id: string) => old.filter((w) => w.id !== id) },
  });
  return (
    <>
      <PageTitle eyebrow="Vagas" title="Lista de espera" />
      {isLoading && <ListSkeleton />}
      {error && <ErrorState error={error} retry={refetch} />}
      {data && !data.length && <div className="card"><Empty title="Ninguém na fila" body="Quando um paciente entrar na lista, aparece aqui." /></div>}
      {!!data?.length && (
        <ul className="card divide-y divide-line overflow-hidden">
          {data.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate font-medium">{w.patient.user.name}</p>
                <p className="text-sm text-ink-3">{WEEKDAYS[w.weekday]}, {w.hour}h · {w.unit.name} · {formatPhone(w.patient.phone)}</p>
              </div>
              {w.status === "OFERTADA" ? <Badge tone="accent">Vaga ofertada até {fmtTime(w.holdUntil!)}</Badge> : <Badge>Aguardando</Badge>}
              <Button variant="line" onClick={() => remove.mutate(w.id)}>Remover</Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
