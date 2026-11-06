"use client";

import { CalendarPlus, Download } from "lucide-react";
import { downloadIcs, googleCalendarUrl, type PublicEvent } from "@/lib/calendar";

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
