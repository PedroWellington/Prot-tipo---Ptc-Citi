import type { LucideIcon } from "lucide-react";

export type MarqueeItem = { key: string; icon: LucideIcon; title: string; detail?: string };

function Chips({ items, copy }: { items: MarqueeItem[]; copy?: boolean }) {
  return (
    // A cópia existe só para o loop não ter salto: leitores de tela não a leem
    <ul className="marquee-list" aria-hidden={copy || undefined}>
      {items.map((i) => (
        <li key={i.key} className="lift flex shrink-0 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
          <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"><i.icon strokeWidth={1.6} className="size-[18px]" /></span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold whitespace-nowrap">{i.title}</span>
            {i.detail && <span className="text-xs whitespace-nowrap text-ink-2">{i.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Faixa em loop infinito, só CSS: duas cópias lado a lado e translateX(-50%).
 * Focável para que o teclado também consiga pausar; com menos movimento vira linha rolável sem a cópia.
 */
export function Marquee({ items, label, reverse, seconds = 50 }: { items: MarqueeItem[]; label: string; reverse?: boolean; seconds?: number }) {
  if (!items.length) return null;
  return (
    <div role="region" aria-label={label} tabIndex={0} className="marquee" data-reverse={reverse || undefined} style={{ "--marquee-dur": `${seconds}s` } as React.CSSProperties}>
      <div className="marquee-track">
        <Chips items={items} />
        <Chips items={items} copy />
      </div>
    </div>
  );
}
