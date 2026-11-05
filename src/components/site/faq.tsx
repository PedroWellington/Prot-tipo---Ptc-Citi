"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";

/** Acordeão: a altura anima por grid-template-rows no CSS; aqui só o estado aberto/fechado. */
export function Faq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const id = useId();
  return (
    <ul className="flex flex-col gap-3">
      {items.map((it, i) => {
        const on = open === i;
        return (
          <li key={it.q} data-reveal="card" style={{ "--i": i } as React.CSSProperties}>
            <div className="faq-item lift card px-5 sm:px-6" data-open={on || undefined}>
              <h3>
                <button type="button" aria-expanded={on} aria-controls={`${id}-${i}`} onClick={() => setOpen(on ? null : i)}
                  className="flex min-h-14 w-full items-center justify-between gap-4 py-3 text-left font-semibold">
                  {it.q}<ChevronDown strokeWidth={1.8} aria-hidden className="faq-chevron size-5 shrink-0 text-accent" />
                </button>
              </h3>
              {/* Fechado continua no DOM (para a altura animar), mas fora do teclado e do leitor de tela */}
              <div id={`${id}-${i}`} role="region" aria-label={it.q} className="faq-body" inert={!on}>
                <div><p className="pb-4 leading-relaxed text-ink-2">{it.a}</p></div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
