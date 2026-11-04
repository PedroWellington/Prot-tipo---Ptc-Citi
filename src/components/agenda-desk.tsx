"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, CalendarClock, ChartColumn, CircleCheckBig, Clock, Phone, Timer, UserCheck, UserX } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatPhone, LATE_STATUS, LATE_STEP, SESSION_STATUS } from "@/lib/labels";
import { fmtTime } from "@/lib/time";
import type { lateTimeline } from "@/server/services/late";
import { isOpen, type AgendaItem } from "./agenda-row";
import { DayList, filterRows, MODES, MonthView, useMode, weekStartOf, WeekView } from "./agenda-views";
import { DayNav } from "./day-nav";
import { GoogleButton } from "./google-calendar";
import { Sheet } from "./lazy-sheet";
import { MissSheet, type MissInput } from "./miss-sheet";
import { useUnits } from "./patient-form";
import { useAction } from "./providers";
import { DaySummary } from "./charts";
import { Badge, Button, Card, cx, Empty, ErrorState, ListSkeleton, PageTitle, SearchField, Segmented, Select, Stat, Tile } from "./ui";

const Row = memo(function Row({ s, selected, onSelect }: { s: AgendaItem; selected: boolean; onSelect: (id: string) => void }) {
  const st = SESSION_STATUS[s.status];
  return (
    <li>
      <button type="button" onClick={() => onSelect(s.id)} aria-pressed={selected} className={cx("row-hover grid w-full grid-cols-[56px_1fr_auto] items-center gap-3 px-4 py-3 text-left", selected && "bg-accent-soft")}>
        <span className="font-display text-2xl tabular-nums">{fmtTime(s.startsAt)}</span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{s.patient.user.name}</span>
          <span className="block truncate text-sm text-ink-3">{s.unit.code} · {s.physio.user.name} · sessão {s.number}</span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <Badge tone={st.tone}>{st.label}</Badge>
          {s.late && <Badge tone="warn">{LATE_STATUS[s.late.status]}</Badge>}
          {s.checkedInAt && !s.late && <Badge tone="ok">Chegou</Badge>}
        </span>
      </button>
    </li>
  );
});

function Timeline({ id, status }: { id: string; status?: string }) {
  const { data } = useQuery({
    queryKey: ["late", id, status], placeholderData: undefined, refetchInterval: 5_000,
    queryFn: () => api<Awaited<ReturnType<typeof lateTimeline>>>(`/desk/sessions/${id}/late`),
  });
  if (!data?.steps.length) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Linha do tempo do atraso</h3>
      <ol className="flex flex-col gap-1.5 border-l border-line-strong pl-3 text-sm">
        {data.steps.map((p) => (
          <li key={p.id}><span className="text-ink-3 tabular-nums">{fmtTime(p.createdAt)}</span> {LATE_STEP[p.action] ?? p.action}</li>
        ))}
      </ol>
    </div>
  );
}

function Details({ s, onConfirm, onMiss, onCheckIn, onLate }: { s: AgendaItem; onConfirm: () => void; onMiss: () => void; onCheckIn: () => void; onLate: () => void }) {
  const st = SESSION_STATUS[s.status];
  const unpaid = s.payment?.status === "AGUARDANDO";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-3xl tabular-nums">{fmtTime(s.startsAt)}</p>
          <p className="text-lg font-medium">{s.patient.user.name}</p>
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-ink-3">Sessão</dt><dd>{s.number} de {s.treatment.totalSessions}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-ink-3">Fisioterapeuta</dt><dd className="text-right">{s.physio.user.name}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-ink-3">Unidade</dt><dd>{s.unit.name}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-ink-3">Tipo</dt><dd>{s.patient.type === "CONVENIO" ? s.patient.insurer : "Particular"}</dd></div>
      </dl>
      {s.provisional && <p className="text-sm text-warn">Horário pré-reservado, aguardando o convênio.</p>}
      {unpaid && <p className="text-sm text-warn">Reservada: aguardando confirmação do PIX.</p>}
      {s.checkedInAt && <p className="text-sm text-ok">Check-in às {fmtTime(s.checkedInAt)}</p>}
      <a href={`tel:${s.patient.phone}`} className="btn btn-line"><Phone strokeWidth={1.5} className="size-4" />{formatPhone(s.patient.phone)}</a>
      {isOpen(s) && (
        <div className="flex flex-wrap gap-2">
          {!s.checkedInAt && <Button className="flex-1" onClick={onCheckIn}><UserCheck strokeWidth={1.5} className="size-4" />Check-in</Button>}
          {s.status === "AGENDADA" && !unpaid && <Button variant="ghost" className="flex-1" onClick={onConfirm}>Confirmar</Button>}
          {!s.checkedInAt && !s.late && !unpaid && <Button variant="ghost" className="flex-1" onClick={onLate}><Timer strokeWidth={1.5} className="size-4" />Paciente atrasado</Button>}
          <Button variant="line" className="flex-1" onClick={onMiss}>Registrar ausência</Button>
        </div>
      )}
      {s.late && <Timeline id={s.id} status={s.late.status} />}
    </div>
  );
}

export function AgendaDesk({ initial, day: firstDay, serverAt, fixedUnit, google }: { initial: AgendaItem[]; day: number; serverAt: number; fixedUnit?: string | null; google: boolean }) {
  const [day, setDay] = useState(firstDay);
  const [mode, setMode] = useMode();
  const [unit, setUnit] = useState(fixedUnit ?? "");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [physio, setPhysio] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [miss, setMiss] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(false);
  const { data: units } = useUnits();
  // Só no estreito abre o sheet: no desktop os detalhes já estão no painel lateral
  const select = useCallback((id: string) => {
    setSelectedId(id);
    setNarrow(!matchMedia("(min-width: 1280px)").matches);
  }, []);

  const isFirst = day === firstDay && unit === (fixedUnit ?? "");
  const key = ["agenda", day, unit];
  const week = weekStartOf(day);
  const weekQ = useQuery({
    queryKey: ["agenda-semana", week, unit], enabled: mode === "semana", staleTime: 20_000,
    queryFn: () => api<AgendaItem[]>(`/desk/agenda?dias=7&date=${new Date(week).toISOString()}${unit ? `&unitId=${unit}` : ""}`),
  });
  const { data, isLoading, isPlaceholderData, error, refetch } = useQuery({
    queryKey: key, refetchInterval: mode === "dia" ? 20_000 : false, enabled: mode === "dia" || isFirst,
    initialData: isFirst ? initial : undefined, initialDataUpdatedAt: isFirst ? serverAt : undefined,
    queryFn: () => api<AgendaItem[]>(`/desk/agenda?date=${new Date(day).toISOString()}${unit ? `&unitId=${unit}` : ""}`),
  });

  const setLocal = (old: AgendaItem[], id: string, patch: Partial<AgendaItem>) => old.map((s) => (s.id === id ? { ...s, ...patch } : s));
  const confirm = useAction({
    run: (id: string) => api(`/desk/sessions/${id}/confirm`, { body: {} }),
    optimistic: { key, update: (old: AgendaItem[], id: string) => setLocal(old, id, { status: "CONFIRMADA" }) },
    invalidate: [["agenda-semana"], ["agenda-mes"]],
  });
  const missed = useAction({
    run: ({ id, ...body }: MissInput & { id: string }) => api(`/desk/sessions/${id}/miss`, { body }),
    optimistic: { key, update: (old: AgendaItem[], v: MissInput & { id: string }) => setLocal(old, v.id, { status: v.status }) },
    invalidate: [["agenda-semana"], ["agenda-mes"]], success: "Registrado. Reposição criada ao fim do plano.",
  });

  const checkIn = useAction({
    run: (id: string) => api(`/desk/sessions/${id}/checkin`, { body: {} }),
    optimistic: { key, update: (old: AgendaItem[], id: string) => setLocal(old, id, { checkedInAt: new Date() }) },
    invalidate: [["agenda-semana"]], success: "Check-in feito",
  });
  const markLate = useAction({
    run: (id: string) => api(`/desk/sessions/${id}/late`, { body: {} }),
    optimistic: { key, update: (old: AgendaItem[], id: string) => setLocal(old, id, { late: { status: "AGUARDANDO" } }) },
    invalidate: [["whatsapp"]], success: "Paciente avisado. Acompanhe na linha do tempo.",
  });

  const filters = useMemo(() => ({ search, status, physio }), [search, status, physio]);
  const rows = useMemo(() => filterRows(data ?? [], filters), [data, filters]);
  const weekRows = useMemo(() => weekQ.data && filterRows(weekQ.data, filters), [weekQ.data, filters]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of (mode === "semana" ? weekQ.data : data) ?? []) c[s.status] = (c[s.status] ?? 0) + 1;
    return c;
  }, [data, weekQ.data, mode]);
  const physios = (units ?? []).filter((u) => !unit || u.id === unit).flatMap((u) => u.physios);
  const monthParams = useMemo(() => ({ unitId: unit || undefined, status: status || undefined, q: search || undefined, physioId: physio || undefined }), [unit, status, search, physio]);
  const [picked, setPicked] = useState<AgendaItem | null>(null);
  const openDay = (d: number) => { setDay(d); setMode("dia"); };

  const selected = data?.find((s) => s.id === selectedId) ?? (picked?.id === selectedId ? picked : null);
  const details = selected && (
    <Details s={selected} onConfirm={() => confirm.mutate(selected.id)} onMiss={() => setMiss(selected.id)} onCheckIn={() => checkIn.mutate(selected.id)} onLate={() => markLate.mutate(selected.id)} />
  );

  return (
    <>
      <PageTitle eyebrow="Painel do dia" title="Agenda" action={<GoogleButton configured={google} />} />
      <div className="flex flex-col gap-4">
        {mode !== "mes" && <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Confirmadas" value={counts.CONFIRMADA ?? 0} icon={<CalendarCheck />} tone="info" />
          <Stat label="A confirmar" value={counts.AGENDADA ?? 0} icon={<Clock />} tone="warn" />
          <Stat label="Realizadas" value={counts.REALIZADA ?? 0} icon={<CircleCheckBig />} tone="ok" />
          <Stat label="Faltas" value={counts.FALTA ?? 0} icon={<UserX />} tone="danger" />
        </div>}
        <div className="grid gap-3 md:grid-cols-2">
          <Segmented label="Visão da agenda" value={mode} onChange={setMode} options={MODES} />
          {fixedUnit ? <p className="flex min-h-11 items-center text-sm text-ink-2">Unidade: <b className="ml-1 font-semibold">{units?.find((u) => u.id === fixedUnit)?.name ?? "sua unidade"}</b></p>
            : <Segmented label="Unidade" value={unit} onChange={(v) => { setUnit(v); setPhysio(""); }} options={[{ value: "", label: "Todas" }, ...(units ?? []).map((u) => ({ value: u.id, label: u.name }))]} />}
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_200px]">
          <SearchField onSearch={setSearch} placeholder="Buscar paciente" />
          <Select label="Status" hideLabel value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos os status</option>
            {Object.entries(SESSION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Select label="Fisioterapeuta" hideLabel value={physio} onChange={(e) => setPhysio(e.target.value)}>
            <option value="">Todas as fisioterapeutas</option>
            {physios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
        {mode !== "mes" && <DayNav day={mode === "semana" ? week : day} onChange={setDay} week={mode === "semana"} />}

        {mode === "semana" && <WeekView start={week} rows={weekRows} loading={weekQ.isLoading} onDay={openDay} onSession={(s) => { setPicked(s); select(s.id); setNarrow(true); }} />}
        {mode === "mes" && (
          <MonthView day={day} params={monthParams} onOpenDay={openDay}
            renderDay={(d) => <DayList day={d} endpoint="/desk/agenda" unit={unit || undefined} filters={filters} onSession={(s) => { setPicked(s); select(s.id); setNarrow(true); }} />} />
        )}
        {mode === "dia" && <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className={cx("min-w-0", isPlaceholderData && "opacity-60")}>
            {isLoading && <ListSkeleton />}
            {error && <ErrorState error={error} retry={refetch} />}
            {data && !rows.length && <div className="card"><Empty title="Nada por aqui" body="Nenhuma sessão com estes filtros." /></div>}
            {!!rows.length && (
              <ul className="card divide-y divide-line overflow-hidden">
                {rows.map((s) => <Row key={s.id} s={s} selected={s.id === selectedId} onSelect={select} />)}
              </ul>
            )}
          </div>
          <aside className="flex flex-col gap-4 xl:sticky xl:top-8">
            <Card className="hidden xl:block">
              {details ?? (
                <div className="flex flex-col items-center gap-2 py-6 text-center text-ink-2">
                  <CalendarClock strokeWidth={1.2} className="size-9 text-ink-3" />
                  <p>Selecione uma sessão para ver os detalhes.</p>
                </div>
              )}
            </Card>
            {data && (
              <Card>
                <h2 className="mb-4 flex items-center gap-3 font-semibold"><Tile tone="accent"><ChartColumn /></Tile>Resumo do dia por unidade</h2>
                <DaySummary sessions={data} />
              </Card>
            )}
          </aside>
        </div>}
      </div>
      <Sheet open={!!selected && narrow} onClose={() => setSelectedId(null)} title="Sessão">{details}</Sheet>
      <MissSheet open={!!miss} onClose={() => setMiss(null)} onSubmit={(v) => miss && missed.mutate({ ...v, id: miss })} />
    </>
  );
}
