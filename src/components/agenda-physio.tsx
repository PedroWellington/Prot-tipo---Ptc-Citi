"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Check, CircleCheckBig, Clock, MessageCircleHeart } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AgendaRow, isOpen, type AgendaItem } from "@/components/agenda-row";
import { DayList, MODES, MonthView, useMode, weekStartOf, WeekView } from "@/components/agenda-views";
import { DayNav } from "@/components/day-nav";
import { GoogleButton } from "@/components/google-calendar";
import { MissSheet, type MissInput } from "@/components/miss-sheet";
import { useAction } from "@/components/providers";
import { Button, Empty, ErrorState, ListSkeleton, PageTitle, Segmented, Stat } from "@/components/ui";
import { api } from "@/lib/api";

const NO_FILTERS = { status: "", search: "", physio: "" };
const NO_PARAMS = {};

export function AgendaPhysio({ initial, day: firstDay, serverAt, deskless, google }: { initial: AgendaItem[]; day: number; serverAt: number; deskless: boolean; google: boolean }) {
  const [day, setDay] = useState(firstDay);
  const [mode, setMode] = useMode();
  const week = weekStartOf(day);
  const weekQ = useQuery({
    queryKey: ["physio-agenda-semana", week], enabled: mode === "semana", staleTime: 20_000,
    queryFn: () => api<AgendaItem[]>(`/physio/agenda?dias=7&date=${new Date(week).toISOString()}`),
  });
  const openDay = (d: number) => { setDay(d); setMode("dia"); };
  const [miss, setMiss] = useState<string | null>(null);
  const key = ["physio-agenda", day];
  const { data, isLoading, isPlaceholderData, error, refetch } = useQuery({
    queryKey: key, refetchInterval: mode === "dia" ? 30_000 : false, enabled: mode === "dia" || day === firstDay,
    initialData: day === firstDay ? initial : undefined, initialDataUpdatedAt: day === firstDay ? serverAt : undefined,
    queryFn: () => api<AgendaItem[]>(`/physio/agenda?date=${new Date(day).toISOString()}`),
  });
  const patch = (old: AgendaItem[], id: string, status: AgendaItem["status"]) =>
    old.map((s) => (s.id === id ? { ...s, status, treatment: status === "REALIZADA" ? { ...s.treatment, completedSessions: s.treatment.completedSessions + 1 } : s.treatment } : s));

  const done = useAction({
    run: (id: string) => api<{ done: number; total: number }>(`/physio/sessions/${id}/done`, { body: {} }),
    optimistic: { key, update: (old: AgendaItem[], id: string) => patch(old, id, "REALIZADA") },
    invalidate: [["treatment"], ["physio-patients"]],
  });
  const checkIn = useAction({
    run: (id: string) => api(`/desk/sessions/${id}/checkin`, { body: {} }),
    optimistic: { key, update: (old: AgendaItem[], id: string) => old.map((s) => (s.id === id ? { ...s, checkedInAt: new Date() } : s)) },
    success: "Check-in feito",
  });
  const missed = useAction({
    run: ({ id, ...body }: MissInput & { id: string }) => api(`/physio/sessions/${id}/miss`, { body }),
    optimistic: { key, update: (old: AgendaItem[], v: MissInput & { id: string }) => patch(old, v.id, v.status) },
    invalidate: [["treatment"]], success: "Registrado. Reposição criada ao fim do plano.",
  });

  const rows = data?.filter((s) => s.status !== "REAGENDADA");

  return (
    <>
      <PageTitle eyebrow="Fisioterapeuta" title="Minha agenda" action={<GoogleButton configured={google} />} />
      <div className="flex flex-col gap-4">
        <Segmented label="Visão da agenda" value={mode} onChange={setMode} options={MODES} />
        {mode !== "mes" && <DayNav day={mode === "semana" ? week : day} onChange={setDay} week={mode === "semana"} />}
        {mode === "semana" && <WeekView start={week} rows={weekQ.data?.filter((s) => s.status !== "REAGENDADA")} loading={weekQ.isLoading} onDay={openDay} />}
        {mode === "mes" && <MonthView day={day} params={NO_PARAMS} onOpenDay={openDay} renderDay={(d) => <DayList day={d} endpoint="/physio/agenda" filters={NO_FILTERS} />} />}
        {mode === "dia" && <>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Sessões" value={rows?.length ?? 0} icon={<CalendarDays />} tone="info" />
          <Stat label="Realizadas" value={rows?.filter((s) => s.status === "REALIZADA").length ?? 0} icon={<CircleCheckBig />} tone="ok" />
          <Stat label="A atender" value={rows?.filter(isOpen).length ?? 0} icon={<Clock />} tone="warn" />
        </div>
        {isLoading && <ListSkeleton />}
        {error && <ErrorState error={error} retry={refetch} />}
        {rows && !rows.length && <div className="card"><Empty title="Dia livre" body="Nenhuma sessão nesta data." /></div>}
        {!!rows?.length && (
          <ul className={`card divide-y divide-line overflow-hidden ${isPlaceholderData ? "opacity-60" : ""}`}>
            {rows.map((s) => {
              const n = s.treatment.completedSessions;
              const script = isOpen(s) && n >= 2 && n <= 4 && !s.treatment.scriptDoneAt;
              return (
                <div key={s.id}>
                  <AgendaRow s={s} subtitle={`Sessão ${s.number} de ${s.treatment.totalSessions}`}>
                    {isOpen(s) && (
                      <>
                        {deskless && !s.checkedInAt && <Button variant="ghost" className="flex-1" onClick={() => checkIn.mutate(s.id)}>Check-in</Button>}
                        <Button className="flex-1" onClick={() => done.mutate(s.id)}><Check strokeWidth={1.5} className="size-4" />Realizada</Button>
                        <Button variant="line" className="flex-1" onClick={() => setMiss(s.id)}>Ausência</Button>
                      </>
                    )}
                  </AgendaRow>
                  {script && (
                    <Link href={`/fisio/pacientes/${s.treatmentId}`} className="mx-4 mb-3 flex min-h-11 items-center gap-2 rounded-xl bg-accent-soft px-3 text-sm">
                      <MessageCircleHeart strokeWidth={1.5} className="size-4 shrink-0 text-accent" />
                      Fase de alívio: faça o roteiro de 1 minuto sobre as sessões finais
                    </Link>
                  )}
                </div>
              );
            })}
          </ul>
        )}
        </>}
      </div>
      <MissSheet open={!!miss} onClose={() => setMiss(null)} onSubmit={(v) => miss && missed.mutate({ ...v, id: miss })} />
    </>
  );
}
