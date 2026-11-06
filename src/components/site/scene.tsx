import { ArrowDown, Hand, Mouse } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { MarcaMovimento } from "../marca";

const vars = (v: Record<string, number | string>) => v as CSSProperties;

/**
 * Formas da abertura, na ordem das frases (Admin > Textos > Cena de abertura). Desenhadas por partículas no palco;
 * o SVG estático de cada uma (scripts/gerar-particulas.ts) aparece no lugar quando não há movimento, JS ou WebGL.
 */
export const SHAPES = [
  { key: "coluna", label: "coluna vertebral" },
  { key: "figura", label: "figura em alongamento" },
  { key: "joelho", label: "articulação do joelho" },
  { key: "anel", label: "anel de progresso completo" },
] as const;
export const FORMAS_DIR = "/site/formas-v1";

/** Palavras da frase, cada uma num span para entrar escalonada; o texto inteiro continua legível no DOM. */
export function splitWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/**
 * Palco da abertura (ParticleStage). Quadro 0: título, frase e botões (já visíveis no HTML: é o LCP), com a esfera de
 * partículas à direita. Quadros 1–4: uma frase de cada lado, oposta à forma. O canvas é decorativo (aria-hidden) e
 * nunca recebe clique. Sem .scene-live (sem JS, sem WebGL2 ou com menos movimento) tudo vira blocos normais.
 */
export type Phrase = { title: string; sub: string };

/**
 * Aviso "Role para ver": pílula na base da primeira tela. É um link para a primeira forma (funciona sem JS);
 * com o palco, scene-driver.tsx rola suavemente até ela e o esconde depois de ~40 px de rolagem.
 */
function ScrollHint({ desktop, mobile }: { desktop: string; mobile: string }) {
  return (
    <a href="#cena-1" className="scene-hint" data-scene-hint>
      <Mouse aria-hidden strokeWidth={1.8} className="hint-desk size-5" />
      <Hand aria-hidden strokeWidth={1.8} className="hint-mob size-5" />
      <span className="hint-desk">{desktop}</span>
      <span className="hint-mob">{mobile}</span>
      <ArrowDown aria-hidden strokeWidth={2} className="hint-arrow size-4" />
    </a>
  );
}

export function Scene({ hero, phrases, hint, edge }: { hero: { node: ReactNode; lcp?: boolean }[]; phrases: Phrase[]; hint: { desktop: string; mobile: string }; edge?: ReactNode }) {
  return (
    <section id="inicio" aria-labelledby="inicio-t" className="scene site-section site-dark overflow-x-clip" data-scene>
      <div className="scene-sticky">
        <canvas aria-hidden className="scene-canvas" data-scene-canvas />
        {/* Até as partículas chegarem: brilho e o monograma no lugar da esfera (some quando o canvas aparece) */}
        <div aria-hidden className="scene-glow"><MarcaMovimento className="scene-glow-mark" /></div>
        <div className="scene-frame scene-hero is-on" data-frame={0}>
          <div className="scene-hero-text hero-seq">
            {hero.map(({ node, lcp }, i) => <div key={i} className={lcp ? "scene-item hero-lcp" : "scene-item"} style={vars({ "--i": i, "--side": i % 2 === 0 ? -1 : 1 })}>{node}</div>)}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG vetorial estático: não passa pelo otimizador de imagens */}
          <img aria-hidden alt="" src={`${FORMAS_DIR}/esfera.svg`} width={400} height={400} loading="lazy" decoding="async" className="scene-shape" />
        </div>
        {phrases.map(({ title, sub }, k) => (
          <div key={k} id={`cena-${k + 1}`} className="scene-frame scene-phrase" data-frame={k + 1} data-side={k % 2 === 0 ? "r" : "l"}>
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG vetorial estático: não passa pelo otimizador de imagens */}
            <img alt="" src={`${FORMAS_DIR}/${SHAPES[k].key}.svg`} width={400} height={400} loading="lazy" decoding="async" className="scene-shape" data-forma={SHAPES[k].key} />
            <div className="scene-copy" style={vars({ "--n": splitWords(title).length })}>
              <p className="scene-text font-display">
                {splitWords(title).map((w, i) => <span key={i}><span className="scene-word" style={vars({ "--i": i })}>{w}</span>{" "}</span>)}
              </p>
              {sub && <p className="scene-sub">{sub}</p>}
            </div>
          </div>
        ))}
        <ScrollHint {...hint} />
      </div>
      {/* Fim do palco: o cabeçalho completo desce quando este marcador entra na tela (site/header.tsx) */}
      <div aria-hidden className="scene-end" data-scene-end />
      {edge}
    </section>
  );
}
