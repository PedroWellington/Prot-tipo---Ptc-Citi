"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { DAY, fmtLong } from "@/lib/time";

export function DayNav({ day, onChange }: { day: number; onChange: (d: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <button type="button" aria-label="Dia anterior" onClick={() => onChange(day - DAY)} className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-ink-2"><ChevronLeft strokeWidth={1.5} className="size-5" /></button>
      <span className="font-medium first-letter:uppercase">{fmtLong(new Date(day))}</span>
      <button type="button" aria-label="Próximo dia" onClick={() => onChange(day + DAY)} className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-ink-2"><ChevronRight strokeWidth={1.5} className="size-5" /></button>
    </div>
  );
}
