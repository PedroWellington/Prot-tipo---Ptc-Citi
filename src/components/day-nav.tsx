"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { DAY, fmtLong } from "@/lib/time";

const short = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Recife", day: "numeric", month: "short" });

/** Dia a dia, ou semana a semana com `week` (day = segunda-feira). */
export function DayNav({ day, onChange, week }: { day: number; onChange: (d: number) => void; week?: boolean }) {
  const step = week ? 7 * DAY : DAY;
  const unit = week ? "Semana" : "Dia";
  return (
    <div className="flex items-center justify-between gap-2">
      <button type="button" aria-label={`${unit} anterior`} onClick={() => onChange(day - step)} className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-ink-2"><ChevronLeft strokeWidth={1.5} className="size-5" /></button>
      <span className="font-medium first-letter:uppercase" aria-live="polite">
        {week ? `Semana de ${short.format(new Date(day))} a ${short.format(new Date(day + 6 * DAY))}`.replace(/\./g, "") : fmtLong(new Date(day))}
      </span>
      <button type="button" aria-label={`Próxim${week ? "a semana" : "o dia"}`} onClick={() => onChange(day + step)} className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-ink-2"><ChevronRight strokeWidth={1.5} className="size-5" /></button>
    </div>
  );
}
