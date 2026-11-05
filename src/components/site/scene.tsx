import type { CSSProperties, ReactNode } from "react";

/** Símbolo no centro da esfera: o "M" do logo (padrão) ou a esfera lisa. Troque aqui para mudar a página inteira. */
export type OrbSymbol = "m" | "liso";
export const SCENE_SYMBOL: OrbSymbol = "m";

const vars = (v: Record<string, number | string>) => v as CSSProperties;

/** Esfera da cena: gradiente da cor primária com camadas de tom; decorativa (o texto da cena diz o que importa). */
export function SceneOrb({ symbol = SCENE_SYMBOL }: { symbol?: OrbSymbol }) {
  return (
    <div aria-hidden className="scene-orb" data-symbol={symbol}>
      <div className="orb-body">
        <div className="orb-halo" />
        <div className="orb-layer orb-1" />
        <div className="orb-layer orb-2" />
        <div className="orb-layer orb-3" />
      </div>
      {symbol === "m" && (
        <div className="orb-mark">
          <svg viewBox="0 0 24 32"><path d="M3 25V8l9 11 9-11v17" fill="none" stroke="var(--orb-mark)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
      )}
    </div>
  );
}

export type WordSpot = { word: string; side: -1 | 1; x: number; y: number; mx: number; ms: -1 | 1; my: number };

/**
 * Onde cada palavra para em volta da esfera. Desktop: lados alternados (x = ±1) e espalhadas na vertical (y).
 * Celular: metade acima e metade abaixo da esfera (ms), em linhas (my), com um leve desvio lateral (mx).
 * O lado de entrada é o lado onde a palavra para; a saída é pelo lado contrário.
 */
export function layoutWords(text: string): WordSpot[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const n = words.length;
  const top = Math.ceil(n / 2);
  return words.map((word, j) => {
    const side = j % 2 === 0 ? -1 : 1;
    const above = j < top;
    const row = above ? top - 1 - j : j - top;
    const ms = above ? -1 : 1;
    return { word, side, x: side, y: Number(((j - (n - 1) / 2) * 0.9).toFixed(2)), mx: side * 0.35, ms, my: ms * (row + 0.5) };
  });
}

/**
 * Palco da abertura. O quadro 0 é a abertura (título, frase e botões, já visíveis no HTML: é o LCP);
 * `lcp` marca o título e a frase: entram só deslizando, nunca transparentes. Os quadros 1–4 são as frases curtas editáveis em Admin > Textos. Todo o texto fica no DOM, na ordem de leitura.
 */
export function Scene({ hero, phrases, symbol = SCENE_SYMBOL, edge }: { hero: { node: ReactNode; lcp?: boolean }[]; phrases: string[]; symbol?: OrbSymbol; edge?: ReactNode }) {
  return (
    <section id="inicio" aria-labelledby="inicio-t" className="scene site-section site-dark overflow-x-clip" data-scene>
      <div className="scene-sticky">
        <div aria-hidden className="scene-veil" />
        <div className="scene-frame scene-hero hero-seq is-on" data-frame={0}>
          {hero.map(({ node, lcp }, i) => <div key={i} className={lcp ? "scene-item hero-lcp" : "scene-item"} style={vars({ "--i": i, "--side": i % 2 === 0 ? -1 : 1 })}>{node}</div>)}
        </div>
        <SceneOrb symbol={symbol} />
        {phrases.map((text, k) => (
          <p key={k} className="scene-frame scene-phrase font-display" data-frame={k + 1}>
            {layoutWords(text).map((w, i) => (
              <span key={i}>
                <span className="scene-word" style={vars({ "--i": i, "--side": w.side, "--x": w.x, "--y": w.y, "--mx": w.mx, "--ms": w.ms, "--my": w.my })}>{w.word}</span>{" "}
              </span>
            ))}
          </p>
        ))}
        <p aria-hidden className="scene-hint items-center gap-2 text-sm text-ink-2">
          <span className="inline-block h-6 w-px bg-current" />Role para ver
        </p>
      </div>
      {/* Marcadores invisíveis: o que cruza o meio da tela define o quadro ativo (5 quadros + o fim) */}
      {[0, 1, 2, 3, 4, 5].map((k) => <div key={k} aria-hidden className="scene-step" data-scene-step={k} style={vars({ "--k": k })} />)}
      {edge}
    </section>
  );
}
