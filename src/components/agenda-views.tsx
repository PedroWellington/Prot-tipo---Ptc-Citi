"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { api } from "@/lib/api";
import { monthCells, monthTitle, shiftMonth, ymOf } from "@/lib/calendar";
import { SESSION_STATUS } from "@/lib/labels";
import { DAY, dayKey, fmtTime, recifeParts, startOfRecifeDay, WEEKDAYS_SHORT } from "@/lib/time";
import type { DayCount } from "@/server/services/agenda";
import type { AgendaItem } from "./agenda-row";
import { Badge, Button, Card, cx, Skeleton } from "./ui";

export type Mode = "dia" | "semana" | "mes";
export const MODES: { value: Mode; label: string }[] = [{ value: "dia", label: "Dia" }, { value: "semana", label: "Semana" }, { value: "mes", label: "Mês" }];
const MODE_KEY = "mv-agenda-modo";

// Armazenamento bloqueado: a escolha vale só nesta visita (fica na memória do módulo)
let picked: Mode | null = null;
const listeners = new Set<() => void>();
const readMode = (): Mode => {
  if (picked) return picked;
  try { const v = localStorage.getItem(MODE_KEY); return v === "semana" || v === "mes" ? v : "dia"; } catch { return "dia"; }
};
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

/** Lembra a última visão escolhida. No servidor é sempre Dia; o navegador troca logo depois de hidratar. */
export function useMode(): [Mode, (m: Mode) => void] {
  const mode = useSyncExternalStore(subscribe, readMode, () => "dia" as Mode);
  return [mode, (m) => {
    picked = m;
    try { localStorage.setItem(MODE_KEY, m); } catch { /* bloqueado */ }
    listeners.forEach((l) => l());
  }];
}

export const weekStartOf = (day: number) => day - ((recifeParts(new Date(day)).weekday + 6) % 7) * DAY;

export type RowFilters = { status: string; search: string; physio: string };
export const filterRows = (rows: AgendaItem[], f: RowFilters) => {
  const term = f.search.toLowerCase();
  return rows.filter((s) => (s.status !== "REAGENDADA" || f.status === "REAGENDADA") && (!f.status || s.status === f.status)
    && (!f.physio || s.physio.id === f.physio) && (!term || s.patient.user.name.toLowerCase().includes(term)));
};

// Cores por status, as mesmas da legenda
const DOTS: { key: string; label: string; cls: string; count: (d: DayCount) => number }[] = [
  { key: "CONFIRMADA", label: "Confirmada", cls: "bg-info", count: (d) => d.status.CONFIRMADA ?? 0 },
  { key: "AGENDADA", label: "A confirmar", cls: "bg-warn", count: (d) => d.status.AGENDADA ?? 0 },
  { key: "REALIZADA", label: "Realizada", cls: "bg-ok", count: (d) => d.status.REALIZADA ?? 0 },
  { key: "FALTA", label: "Falta", cls: "bg-danger", count: (d) => d.status.FALTA ?? 0 },
  { key: "ATRASO", label: "Atraso", cls: "bg-teal", count: (d) => d.late },
];
const STATUS_DOT: Record<string, string> = { CONFIRMADA: "bg-info", AGENDADA: "bg-warn", REALIZADA: "bg-ok", FALTA: "bg-danger", DESMARCADA: "bg-line-strong", REAGENDADA: "bg-line" };

export function Legend() {
  return (
    <ul aria-label="Legenda" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {DOTS.map((d) => <li key={d.key} className="flex items-center gap-1.5"><span aria-hidden className={cx("size-2 rounded-full", d.cls)} />{d.label}</li>)}
      <li className="flex items-center gap-1.5"><AlertTriangle aria-hidden strokeWidth={2} className="size-3 text-warn" />Alerta (convênio ou cheio)</li>
    </ul>
  );
}

/** Semana: 7 colunas no desktop, dias empilhados no celular. Tocar na sessão abre os detalhes; no título do dia, o dia completo. */
export function WeekView({ start, rows, loading, onSession, onDay }: { start: number; rows?: AgendaItem[]; loading: boolean; onSession?: (s: AgendaItem) => void; onDay: (day: number) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => start + i * DAY);
  const byDay = useMemo(() => {
    const m = new Map<string, AgendaItem[]>();
    for (const s of rows ?? []) { const k = dayKey(new Date(s.startsAt)); (m.get(k) ?? m.set(k, []).get(k)!).push(s); }
    return m;
  }, [rows]);
  const today = dayKey(new Date());
  return (
    <div className="grid gap-3 lg:grid-cols-7">
      {days.map((d) => {
        const list = byDay.get(dayKey(new Date(d))) ?? [];
        const p = recifeParts(new Date(d));
        const isToday = dayKey(new Date(d)) === today;
        return (
          <section key={d} aria-label={`${WEEKDAYS_SHORT[p.weekday]} ${p.day}`} className={cx("card flex min-w-0 flex-col p-2", isToday && "outline-2 outline-accent")}>
            <button type="button" onClick={() => onDay(d)} className="row-hover flex min-h-11 items-center justify-between rounded-xl px-2 text-left">
              <span className="text-sm font-semibold">{WEEKDAYS_SHORT[p.weekday]} <span className="tabular-nums">{p.day}</span></span>
              <span className="text-xs text-ink-3 tabular-nums">{loading ? "…" : `${list.length} ${list.length === 1 ? "sessão" : "sessões"}`}</span>
            </button>
            {loading ? <div className="flex flex-col gap-1.5 p-1"><Skeleton className="h-8" /><Skeleton className="h-8" /></div> : (
              <ul className="flex flex-col">
                {list.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => (onSession ? onSession(s) : onDay(d))}
                      className="row-hover flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-xs">
                      <span aria-hidden className={cx("size-2 shrink-0 rounded-full", s.late ? "bg-teal" : STATUS_DOT[s.status])} />
                      <span className="tabular-nums text-ink-2">{fmtTime(s.startsAt)}</span>
                      <span className="min-w-0 flex-1 truncate">{s.patient.user.name}</span>
                      <span className="sr-only">{SESSION_STATUS[s.status].label}</span>
                    </button>
                  </li>
                ))}
                {!list.length && <li className="px-2 py-1 text-xs text-ink-3">Livre</li>}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

export type MonthParams = Record<string, string | undefined>;
const qs = (p: MonthParams) => Object.entries(p).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join("&");
const monthQuery = (ym: string, p: MonthParams) => ({
  queryKey: ["agenda-mes", ym, p], staleTime: 30_000,
  queryFn: () => api<{ month: string; today: string; days: Record<string, DayCount> }>(`/agenda/month?${qs({ mes: ym, ...p })}`),
});

/** Mês: uma consulta agregada (contagens por dia e status). Tocar no dia mostra a lista ao lado (desktop) ou abaixo (celular). */
export function MonthView({ day, params, renderDay, onOpenDay }: { day: number; params: MonthParams; renderDay: (day: number) => ReactNode; onOpenDay: (day: number) => void }) {
  const [ym, setYm] = useState(() => ymOf(new Date(day)));
  const [picked, setPicked] = useState<number>(day);
  const qc = useQueryClient();
  const { data, isLoading, isPlaceholderData } = useQuery({ ...monthQuery(ym, params), placeholderData: (prev, q) => (q?.queryKey[1] === ym ? prev : undefined) });
  // O próximo mês já fica no cache: trocar de mês parece instantâneo
  useEffect(() => { void qc.prefetchQuery(monthQuery(shiftMonth(ym, 1), params)); }, [qc, ym, params]);
  const cells = useMemo(() => monthCells(ym), [ym]);
  const grid = useRef<HTMLDivElement>(null);
  const todayYm = ymOf(new Date());

  const go = (by: number) => setYm((m) => shiftMonth(m, by));
  const pick = (at: number) => setPicked(at);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, at: number) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = at + step * DAY;
    if (ymOf(new Date(next)) !== ym) { setYm(ymOf(new Date(next))); setPicked(next); return; }
    grid.current?.querySelector<HTMLButtonElement>(`[data-at="${next}"]`)?.focus();
    setPicked(next);
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="flex flex-col gap-3 p-3 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <button type="button" aria-label="Mês anterior" onClick={() => go(-1)} className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-ink-2"><ChevronLeft strokeWidth={1.5} className="size-5" /></button>
          <h2 className="font-display text-xl first-letter:uppercase sm:text-2xl" aria-live="polite">{monthTitle(ym)}</h2>
          <div className="flex items-center gap-1">
            {ym !== todayYm && <Button variant="ghost" className="min-h-11 px-3" onClick={() => { setYm(todayYm); pick(startOfRecifeDay(new Date()).getTime()); }}>Hoje</Button>}
            <button type="button" aria-label="Próximo mês" onClick={() => go(1)} className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-ink-2"><ChevronRight strokeWidth={1.5} className="size-5" /></button>
          </div>
        </div>
        <div aria-hidden className="grid grid-cols-7 text-center text-xs font-semibold text-ink-3">
          {[1, 2, 3, 4, 5, 6, 0].map((w) => <span key={w}>{WEEKDAYS_SHORT[w]}</span>)}
        </div>
        <div ref={grid} aria-label={`Sessões de ${monthTitle(ym)}. Use as setas para trocar de dia.`} className={cx("grid grid-cols-7 gap-1 transition-opacity", isPlaceholderData && "opacity-60")}>
          {cells.map((c, i) => {
            if (!c) return <span key={`x${i}`} aria-hidden />;
            if (isLoading) return <Skeleton key={c.key} className="aspect-square rounded-xl sm:aspect-[5/4]" />;
            const d = data?.days[c.key];
            const sel = dayKey(new Date(picked)) === c.key;
            const alert = !!d && (d.renewal > 0 || d.full);
            const label = `${c.day}: ${d ? `${d.total} ${d.total === 1 ? "sessão" : "sessões"}` : "sem sessões"}${d?.status.FALTA ? `, ${d.status.FALTA} faltas` : ""}${d?.renewal ? `, ${d.renewal} com renovação de convênio pendente` : ""}${d?.full ? ", dia cheio" : ""}`;
            return (
              <button key={c.key} type="button" data-at={c.at} aria-label={label} aria-pressed={sel} tabIndex={sel || (!cells.some((x) => x && dayKey(new Date(picked)) === x.key) && c.day === 1) ? 0 : -1}
                onClick={() => pick(c.at)} onDoubleClick={() => onOpenDay(c.at)} onKeyDown={(e) => onKey(e, c.at)}
                className={cx("relative flex aspect-square flex-col items-center gap-0.5 rounded-xl p-1 text-sm transition-transform active:scale-95 sm:aspect-[5/4] sm:items-start sm:p-2",
                  sel ? "bg-accent-soft ring-2 ring-accent" : "row-hover bg-surface-2/60", data?.today === c.key && "font-bold text-accent", d?.full && !sel && "bg-warn-soft")}>
                <span className="tabular-nums">{c.day}</span>
                {d && <span className="hidden text-xs text-ink-2 tabular-nums sm:block">{d.total} {d.total === 1 ? "sessão" : "sessões"}</span>}
                {d && (
                  <span aria-hidden className="mt-auto flex flex-wrap justify-center gap-0.5 sm:justify-start">
                    {DOTS.filter((x) => x.count(d) > 0).map((x) => <span key={x.key} className={cx("size-1.5 rounded-full sm:size-2", x.cls)} />)}
                  </span>
                )}
                {alert && <AlertTriangle aria-hidden strokeWidth={2.2} className="absolute top-1 right-1 size-3 text-warn" />}
              </button>
            );
          })}
        </div>
        <Legend />
      </Card>
      <Card className="flex flex-col gap-3 lg:sticky lg:top-8">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-semibold"><CalendarDays strokeWidth={1.5} className="size-5 text-accent" />Dia {recifeParts(new Date(picked)).day}</h3>
          {!!data?.days[dayKey(new Date(picked))]?.renewal && <Badge tone="warn">{data.days[dayKey(new Date(picked))].renewal} renovação pendente</Badge>}
        </div>
        {renderDay(picked)}
        <Button variant="line" onClick={() => onOpenDay(picked)}>Ver o dia completo</Button>
      </Card>
    </div>
  );
}

/** Lista curta de um dia, com o mesmo cache da visão Dia. */
export function DayList({ day, endpoint, filters, unit, onSession }: { day: number; endpoint: string; filters: RowFilters; unit?: string; onSession?: (s: AgendaItem) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: [endpoint === "/desk/agenda" ? "agenda" : "physio-agenda", day, ...(endpoint === "/desk/agenda" ? [unit ?? ""] : [])],
    placeholderData: keepPreviousData, staleTime: 20_000,
    queryFn: () => api<AgendaItem[]>(`${endpoint}?date=${new Date(day).toISOString()}${unit ? `&unitId=${unit}` : ""}`),
  });
  if (isLoading) return <div className="flex flex-col gap-2"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>;
  const rows = filterRows(data ?? [], filters);
  if (!rows.length) return <p className="py-4 text-center text-sm text-ink-3">Nenhuma sessão com estes filtros.</p>;
  return (
    <ul className="-mx-2 flex max-h-[420px] flex-col overflow-y-auto">
      {rows.map((s) => (
        <li key={s.id}>
          <button type="button" onClick={() => onSession?.(s)} disabled={!onSession} className="row-hover flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-sm disabled:cursor-default">
            <span aria-hidden className={cx("size-2 shrink-0 rounded-full", s.late ? "bg-teal" : STATUS_DOT[s.status])} />
            <span className="tabular-nums">{fmtTime(s.startsAt)}</span>
            <span className="min-w-0 flex-1 truncate">{s.patient.user.name}</span>
            <Badge tone={SESSION_STATUS[s.status].tone}>{SESSION_STATUS[s.status].label}</Badge>
          </button>
        </li>
      ))}
    </ul>
  );
}
