"use client";

import { Check } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Laptop, Phone, type Screen } from "./mockup";

export type TourTab = { id: string; label: string; screen: Screen; phone?: Screen; alt: string; points: string[] };

/** Abas Paciente / Recepção / Fisioterapeuta: trocam o mockup com fade curto. Setas do teclado mudam de aba. */
export default function ProductTour({ tabs }: { tabs: TourTab[] }) {
  const [active, setActive] = useState(0);
  const base = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const next = (active + step + tabs.length) % tabs.length;
    setActive(next);
    buttons.current[next]?.focus();
  };
  const t = tabs[active];
  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
      <div className="lg:col-span-5">
        <div role="tablist" aria-label="Perfis do sistema" onKeyDown={onKey} className="inline-flex flex-wrap gap-1 rounded-full border border-line p-1">
          {tabs.map((x, i) => (
            <button key={x.id} ref={(el) => { buttons.current[i] = el; }} type="button" role="tab" id={`${base}-tab-${i}`} aria-selected={i === active}
              aria-controls={`${base}-panel`} tabIndex={i === active ? 0 : -1} onClick={() => setActive(i)}
              className={`min-h-11 rounded-full px-5 text-sm font-semibold transition-colors ${i === active ? "bg-accent text-[var(--band-ink)]" : "text-ink-2 hover:text-ink"}`}>
              {x.label}
            </button>
          ))}
        </div>
        <ul key={t.id} className="tour-panel mt-6 flex flex-col gap-4">
          {t.points.map((p) => (
            <li key={p} className="flex gap-3 text-lg leading-snug">
              <span aria-hidden className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><Check className="size-4" /></span>{p}
            </li>
          ))}
        </ul>
      </div>
      <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-tab-${active}`} className="lg:col-span-7">
        <div key={t.id} className="tour-panel relative mx-auto max-w-[640px]">
          <Laptop name={t.screen} alt={t.alt} sizes="(min-width: 1024px) 600px, 92vw" />
          {t.phone && <Phone name={t.phone} alt="O mesmo painel no celular" sizes="(min-width: 1024px) 160px, 30vw" className="absolute -right-2 -bottom-4 w-[26%] sm:-right-6" />}
        </div>
      </div>
    </div>
  );
}
