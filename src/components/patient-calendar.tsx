"use client";

import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { downloadIcs, googleCalendarUrl, monthCells, monthTitle, shiftMonth, ymOf, type PublicEvent } from "@/lib/calendar";
import { dayKey, WEEKDAYS_SHORT } from "@/lib/time";
import { Card, cx } from "./ui";

/** "Adicionar ao Google Agenda" sem OAuth: link de criação de evento do Google e arquivo .ics para os outros calendários. */
export function AddToCalendar({ event, compact }: { event: PublicEvent; compact?: boolean }) {
  if (compact)
    return (
      <span className="flex shrink-0">
        <a href={googleCalendarUrl(event)} target="_blank" rel="noreferrer" aria-label="Adicionar ao Google Agenda" title="Adicionar ao Google Agenda"
          className="flex size-9 items-center justify-center rounded-full text-ink-2 row-hover"><CalendarPlus strokeWidth={1.5} className="size-4" /></a>
        <button type="button" onClick={() => downloadIcs(event)} aria-label="Baixar arquivo .ics para outros calendários" title="Baixar .ics"
          className="flex size-9 items-center justify-center rounded-full text-ink-2 row-hover"><Download strokeWidth={1.5} className="size-4" /></button>
      </span>
    );
  return (
    <div className="flex flex-wrap gap-2">
      <a href={googleCalendarUrl(event)} target="_blank" rel="noreferrer" className="btn btn-ghost flex-1"><CalendarPlus strokeWidth={1.5} className="size-4" />Adicionar ao Google Agenda</a>
      <button type="button" onClick={() => downloadIcs(event)} className="btn btn-line flex-1"><Download strokeWidth={1.5} className="size-4" />Outros calendários (.ics)</button>
    </div>
  );
}

const MARK: Record<string, { cls: string; label: string }> = {
  done: { cls: "bg-brand text-on-accent", label: "feita" },
  next: { cls: "ring-2 ring-accent text-accent font-semibold", label: "próxima" },
  miss: { cls: "bg-danger-soft text-danger", label: "falta" },
};

/** Só as sessões do próprio paciente (vêm da tela dele), marcadas no mês. */
export function MiniMonth({ sessions, now }: { sessions: { startsAt: Date | string; status: string }[]; now: number }) {
  const [ym, setYm] = useState(() => ymOf(new Date(now)));
  const marks = useMemo(() => {
    const m = new Map<string, keyof typeof MARK>();
    for (const s of sessions) {
      const k = dayKey(new Date(s.startsAt));
      const kind = s.status === "REALIZADA" ? "done" : s.status === "FALTA" ? "miss" : (s.status === "AGENDADA" || s.status === "CONFIRMADA") && new Date(s.startsAt).getTime() > now ? "next" : null;
      if (kind && !(m.get(k) === "miss")) m.set(k, kind);
    }
    return m;
  }, [sessions, now]);
  const cells = monthCells(ym);
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><CalendarDays strokeWidth={1.5} className="size-5 text-accent" /><span className="first-letter:uppercase">{monthTitle(ym)}</span></h2>
        <span className="flex">
          <button type="button" aria-label="Mês anterior" onClick={() => setYm(shiftMonth(ym, -1))} className="flex size-11 items-center justify-center rounded-full text-ink-2"><ChevronLeft strokeWidth={1.5} className="size-5" /></button>
          <button type="button" aria-label="Próximo mês" onClick={() => setYm(shiftMonth(ym, 1))} className="flex size-11 items-center justify-center rounded-full text-ink-2"><ChevronRight strokeWidth={1.5} className="size-5" /></button>
        </span>
      </div>
      <div aria-hidden className="grid grid-cols-7 text-center text-[11px] font-semibold text-ink-3">{[1, 2, 3, 4, 5, 6, 0].map((w) => <span key={w}>{WEEKDAYS_SHORT[w][0]}</span>)}</div>
      <ol className="mt-1 grid grid-cols-7 gap-1 text-center text-sm">
        {cells.map((c, i) => {
          if (!c) return <li key={`x${i}`} aria-hidden />;
          const m = marks.get(c.key);
          return (
            <li key={c.key} className={cx("mx-auto flex size-8 items-center justify-center rounded-full tabular-nums", m ? MARK[m].cls : "text-ink-2")}>
              {c.day}{m && <span className="sr-only">: sessão {MARK[m].label}</span>}
            </li>
          );
        })}
      </ol>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {Object.values(MARK).map((m) => <li key={m.label} className="flex items-center gap-1.5"><span aria-hidden className={cx("size-3 rounded-full", m.cls)} />{m.label[0].toUpperCase() + m.label.slice(1)}</li>)}
      </ul>
    </Card>
  );
}
