"use client";

import type { CSSProperties } from "react";
import { CountUp } from "./motion";

const R = 88;
const C = 2 * Math.PI * R;

/**
 * Peça central da marca. O arco enche do zero ao abrir (CSS: .ring-arc) e do valor anterior quando a sessão muda;
 * o número conta junto (CountUp). Leitores de tela recebem só "Sessão X de Y".
 */
export function ProgressRing({ done, total }: { done: number; total: number }) {
  return (
    <div className="relative mx-auto aspect-square w-[min(60vw,220px)]" role="img" aria-label={`Sessão ${done} de ${total}`}>
      <svg viewBox="0 0 200 200" className="absolute inset-0 -rotate-90">
        <defs>
          <linearGradient id="ring-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--ring-a)" />
            <stop offset=".6" stopColor="var(--ring-b)" />
            <stop offset="1" stopColor="var(--ring-c)" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r={R} fill="none" stroke="var(--line)" strokeWidth="6" />
        <circle cx="100" cy="100" r={R} fill="none" stroke="url(#ring-g)" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - done / total)} className="ring-arc" style={{ "--ring-c": C } as CSSProperties} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden>
        <span className="text-xs tracking-[.14em] text-ink-3 uppercase">Sessão</span>
        <span className="font-display text-[84px] leading-[.95] tabular-nums"><CountUp value={done} /></span>
        <span className="text-sm text-ink-2">de {total}</span>
      </div>
    </div>
  );
}
