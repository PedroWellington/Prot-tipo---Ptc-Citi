"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Clock, Hourglass } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Sheet } from "@/components/lazy-sheet";
import { useUnits } from "@/components/patient-form";
import type { Home } from "@/components/patient-home";
import { useAction } from "@/components/providers";
import { Badge, Button, Card, cx, Empty, ErrorState, LinkButton, ListSkeleton, PageTitle, Segmented, Select, Skeleton, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { q, type LateOfferRow } from "@/lib/queries";
import { REQUEST_STATUS } from "@/lib/labels";
import { WEEKDAYS, dayKey, fmtLong, fmtTime, fmtWeekShort } from "@/lib/time";
import type { patientRequests, patientWaitlist } from "@/server/repositories/requests";

type Req = Awaited<ReturnType<typeof patientRequests>>[number];
type Wait = Awaited<ReturnType<typeof patientWaitlist>>[number];
type Slot = { startsAt: string; peak: boolean };
type Full = Extract<Home, { sessions: unknown }>;
type SessionRow = Full["sessions"][number];

function SwapSheet({ session, onClose, initialUnit }: { session: SessionRow | null; onClose: () => void; initialUnit?: string }) {
  const { data: units } = useUnits();
  const qc = useQueryClient();
  const [unitId, setUnitId] = useState(initialUnit ?? "");
  const [chosen, setChosen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const unit = unitId || session?.unit.id || "";
  const slots = useQuery({
    queryKey: ["slots", unit], enabled: !!session && !!unit, staleTime: 15_000,
    queryFn: () => api<Slot[]>(`/slots?unitId=${unit}&days=14`),
    placeholderData: undefined, // horários de outra unidade não podem ficar na tela
  });
  const byDay = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of slots.data ?? []) m.set(dayKey(new Date(s.startsAt)), [...(m.get(dayKey(new Date(s.startsAt))) ?? []), s]);
    return [...m.values()];
  }, [slots.data]);

  const send = useAction({
    run: (v: { sessionId: string; targetStartsAt: string; targetUnitId: string; reason: string }) => api("/me/requests", { body: v }),
    optimistic: {
      key: q.requests.queryKey,
      update: (old: Req[], v: { sessionId: string; targetStartsAt: string; targetUnitId: string; reason: string }) => [{
        id: "enviando", status: "PENDENTE", targetStartsAt: v.targetStartsAt, reason: v.reason, response: null, suggestion: null,
        targetUnit: { id: v.targetUnitId, name: units?.find((u) => u.id === v.targetUnitId)?.name ?? "" },
        session: { id: v.sessionId }, createdAt: new Date().toISOString(), decidedAt: null,
      } as unknown as Req, ...old],
    },
    invalidate: [["home"]],
    success: "Solicitação enviada à recepção",
  });
  const submit = () => {
    send.mutate({ sessionId: session!.id, targetStartsAt: chosen!, targetUnitId: unit, reason });
    setChosen(null); setReason(""); onClose();
  };

  return (
    <Sheet open={!!session} onClose={onClose} title="Novo horário">
      {session && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-2">Trocando {fmtLong(session.startsAt)} às {fmtTime(session.startsAt)}. Seu horário atual fica reservado até a recepção responder.</p>
          {units && <Segmented label="Unidade" value={unit} onChange={(v) => { setUnitId(v); setChosen(null); }} options={units.map((u) => ({ value: u.id, label: u.name }))} />}
          {slots.isLoading && <Skeleton className="h-48 w-full" />}
          {slots.error && <ErrorState error={slots.error} retry={slots.refetch} />}
          {slots.data && !slots.data.length && <p className="text-ink-2">Sem horários livres nos próximos 14 dias nesta unidade.</p>}
          <div className="flex flex-col gap-3">
            {byDay.slice(0, 10).map((day) => (
              <div key={day[0].startsAt}>
                <h3 className="mb-1.5 text-sm text-ink-3 first-letter:uppercase">{fmtWeekShort(day[0].startsAt)}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {day.map((s) => (
                    <button key={s.startsAt} type="button" aria-pressed={chosen === s.startsAt} onClick={() => setChosen(s.startsAt)}
                      className={cx("min-h-11 min-w-16 rounded-xl px-3 text-sm tabular-nums transition-transform active:scale-95", chosen === s.startsAt ? "bg-accent-fill font-semibold text-on-accent" : "bg-surface-2 text-ink")}>
                      {fmtTime(s.startsAt)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <Textarea label="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          <Button variant="brand" className="sticky bottom-0 w-full" disabled={!chosen} onClick={submit}>Enviar solicitação</Button>
          <button type="button" className="min-h-11 text-sm text-ink-2 underline underline-offset-4" onClick={() => { onClose(); qc.setQueryData(["open-wait"], true); }}>Nenhum serve? Entrar na lista de espera</button>
        </div>
      )}
    </Sheet>
  );
}

function WaitSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: units } = useUnits();
  const [form, setForm] = useState({ unitId: "", weekday: 1, hour: 17 });
  const join = useAction({
    run: (v: typeof form) => api("/me/waitlist", { body: v }),
    optimistic: {
      key: q.waitlist.queryKey,
      update: (old: Wait[], v: typeof form) => [{ ...v, id: "enviando", status: "ATIVA", unit: { id: v.unitId, name: units?.find((u) => u.id === v.unitId)?.name ?? "" } } as unknown as Wait, ...old],
    },
    success: "Você entrou na lista de espera",
  });
  return (
    <Sheet open={open} onClose={onClose} title="Lista de espera">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-2">Quando esse horário vagar, avisamos você e seguramos a vaga por um tempo. É só confirmar com um toque.</p>
        <Select label="Unidade" value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })}>
          {units?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
        <Select label="Dia da semana" value={form.weekday} onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}>
          {[1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
        </Select>
        <Select label="Hora" value={form.hour} onChange={(e) => setForm({ ...form, hour: Number(e.target.value) })}>
          {[7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19].map((h) => <option key={h} value={h}>{h}h</option>)}
        </Select>
        <Button variant="brand" className="w-full" onClick={() => { join.mutate({ ...form, unitId: form.unitId || units![0].id }); onClose(); }}>Entrar na lista</Button>
      </div>
    </Sheet>
  );
}

function Content() {
  const params = useSearchParams();
  const home = useQuery(q.home);
  const qc = useQueryClient();
  const { data: openWait = false } = useQuery({ queryKey: ["open-wait"], queryFn: () => false, staleTime: Infinity });
  const requests = useQuery(q.requests);
  const waitlist = useQuery(q.waitlist);
  const lateOffers = useQuery(q.lateOffers);
  const [picked, setPicked] = useState<string | null>(params.get("sessao"));

  const sessions = (home.data as Full | undefined)?.sessions ?? [];
  const upcoming = sessions.filter((s) => (s.status === "AGENDADA" || s.status === "CONFIRMADA") && new Date(s.startsAt) > new Date());
  const pendingIds = new Set(requests.data?.filter((r) => r.status === "PENDENTE").map((r) => r.session.id));
  const session = upcoming.find((s) => s.id === picked) ?? null;


  const cancel = useAction({
    run: (id: string) => api(`/me/requests/${id}/cancel`, { body: {} }),
    optimistic: { key: ["requests"], update: (old: Req[], id: string) => old.map((r) => (r.id === id ? { ...r, status: "CANCELADA" } : r)) },
    invalidate: [["home"]],
  });
  const accept = useAction({
    run: (id: string) => api(`/me/waitlist/${id}/accept`, { body: {} }),
    optimistic: { key: q.waitlist.queryKey, update: (old: Wait[], id: string) => old.filter((w) => w.id !== id) },
    invalidate: [["home"]], success: "Vaga garantida. Seu horário foi atualizado.",
  });
  const replyOffer = useAction({
    run: ({ id, button }: { id: string; button: string }) => api(`/me/late-offers/${id}/reply`, { body: { button } }),
    optimistic: { key: q.lateOffers.queryKey, update: (old: LateOfferRow[], v: { id: string }) => old.filter((o) => o.id !== v.id) },
    invalidate: [["home"], ["waitlist"]],
  });
  const leave = useAction({
    run: (id: string) => api(`/me/waitlist/${id}`, { method: "DELETE" }),
    optimistic: { key: ["waitlist"], update: (old: Wait[], id: string) => old.filter((w) => w.id !== id) },
  });

  if (home.isLoading) return <ListSkeleton />;
  if (home.error) return <ErrorState error={home.error} retry={home.refetch} />;

  const offers = waitlist.data?.filter((w) => w.status === "OFERTADA") ?? [];
  const pending = requests.data?.filter((r) => r.status === "PENDENTE") ?? [];
  const history = requests.data?.filter((r) => r.status !== "PENDENTE") ?? [];

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
      {lateOffers.data?.map((o) => (
        <Card key={o.id} className="border-accent/40">
          <p className="text-sm font-semibold text-accent">Surgiu uma vaga</p>
          <p className="mt-1 font-display text-2xl first-letter:uppercase">{fmtLong(o.lateEvent.session.startsAt)} às {fmtTime(o.lateEvent.session.startsAt)}</p>
          <p className="text-sm text-ink-2">{o.lateEvent.unit.name} · quem confirmar primeiro fica com a vaga</p>
          <div className="mt-3 flex gap-2">
            <Button variant="brand" className="flex-1" onClick={() => replyOffer.mutate({ id: o.id, button: "sim" })}>Quero a vaga</Button>
            <Button variant="line" className="flex-1" onClick={() => replyOffer.mutate({ id: o.id, button: "nao" })}>Não posso</Button>
          </div>
        </Card>
      ))}
      {offers.map((o) => (
        <Card key={o.id} className="border-accent/40">
          <p className="text-sm font-semibold text-accent">Abriu a vaga que você esperava</p>
          <p className="mt-1 font-display text-2xl first-letter:uppercase">{fmtLong(o.offeredStartsAt!)} às {fmtTime(o.offeredStartsAt!)}</p>
          <p className="text-sm text-ink-2">{o.unit.name} · guardada até {fmtTime(o.holdUntil!)}</p>
          <Button variant="brand" className="mt-3 w-full" onClick={() => accept.mutate(o.id)}>Quero esta vaga</Button>
        </Card>
      ))}

      {pending.map((r) => (
        <Card key={r.id} className="border-warn/40">
          <p className="flex items-center gap-2 font-semibold"><Clock strokeWidth={1.5} className="size-5 text-warn" />Solicitação em andamento</p>
          <p className="mt-1 text-sm text-ink-2">Aguardando a recepção autorizar a mudança para {fmtLong(r.targetStartsAt)} às {fmtTime(r.targetStartsAt)} em {r.targetUnit.name}. Seu horário original continua reservado.</p>
          <Button variant="line" className="mt-3" onClick={() => cancel.mutate(r.id)}>Cancelar solicitação</Button>
        </Card>
      ))}

      <section>
        <h2 className="mb-2 font-semibold">Qual sessão você quer trocar?</h2>
        {!upcoming.length ? (
          <Card><Empty art={<CalendarClock strokeWidth={1.2} className="size-10 text-ink-3" />} title="Nenhuma sessão futura" body="Quando houver sessões agendadas, elas aparecem aqui." action={<LinkButton variant="ghost" href="/app/agendar">Agendar</LinkButton>} /></Card>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {upcoming.map((s) => (
              <li key={s.id}>
                <button type="button" disabled={pendingIds.has(s.id)} onClick={() => setPicked(s.id)} className="row-hover flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left disabled:opacity-60">
                  <span className="min-w-0">
                    <span className="block first-letter:uppercase">{fmtWeekShort(s.startsAt)} · {fmtTime(s.startsAt)}</span>
                    <span className="block truncate text-sm text-ink-3">Sessão {s.number} · {s.unit.name}</span>
                  </span>
                  {pendingIds.has(s.id) ? <Badge tone="warn">Em andamento</Badge> : <span className="text-sm font-semibold text-accent">Trocar</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      </div>
      <div className="flex flex-col gap-4">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Lista de espera</h2>
          <Button variant="ghost" onClick={() => qc.setQueryData(["open-wait"], true)}><Hourglass strokeWidth={1.5} className="size-4" />Entrar</Button>
        </div>
        {waitlist.data?.filter((w) => w.status === "ATIVA").map((w) => (
          <div key={w.id} className="card mb-2 flex items-center justify-between gap-3 p-4">
            <span>{WEEKDAYS[w.weekday]}, {w.hour}h · {w.unit.name}</span>
            <Button variant="line" onClick={() => leave.mutate(w.id)}>Sair</Button>
          </div>
        ))}
      </section>

      {!!history.length && (
        <section>
          <h2 className="mb-2 font-semibold">Histórico</h2>
          <ul className="card divide-y divide-line">
            {history.map((r) => (
              <li key={r.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="first-letter:uppercase">{fmtWeekShort(r.targetStartsAt)} · {fmtTime(r.targetStartsAt)}</span>
                  <Badge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Badge>
                </div>
                {r.response && <p className="mt-1 text-sm text-ink-2">{r.response}</p>}
                {r.suggestion && <p className="text-sm text-ink-2">Sugestão: {r.suggestion}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      </div>

      <SwapSheet session={session} initialUnit={params.get("unidade") ?? undefined} onClose={() => setPicked(null)} />
      <WaitSheet open={openWait} onClose={() => qc.setQueryData(["open-wait"], false)} />
    </div>
  );
}

export default function Page() {
  return (
    <>
      <PageTitle eyebrow="Mudou a rotina?" title="Troca de horário" />
      <Suspense fallback={<ListSkeleton />}><Content /></Suspense>
    </>
  );
}
