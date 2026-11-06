"use client";

import { useId, type CSSProperties } from "react";
import { caminhos, TRACO, VARIANTE_PADRAO, type Variante } from "@/lib/marca";

/**
 * Monograma "M" da Movimento (geometria em lib/marca.ts). Traço único com o degradê da marca (--ring-a → --ring-b).
 * O degradê usa userSpaceOnUse: retas verticais têm caixa de largura zero e sumiriam com objectBoundingBox.
 * Id próprio por instância: um degradê dentro de um SVG escondido (display: none) não pinta os outros.
 */
export function MarcaMovimento({ variante = VARIANTE_PADRAO, className, style, title }: { variante?: Variante; className?: string; style?: CSSProperties; title?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 48 48" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} className={className} style={style} data-variante={variante}>
      <defs>
        <linearGradient id={id} x1="4" x2="44" y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--ring-a)" /><stop offset="1" stopColor="var(--ring-b)" />
        </linearGradient>
      </defs>
      {caminhos(variante).map((d) => (
        <path key={d} d={d} fill="none" stroke={`url(#${id})`} strokeWidth={TRACO} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
