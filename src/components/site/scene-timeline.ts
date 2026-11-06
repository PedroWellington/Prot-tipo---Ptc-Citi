/**
 * Linha do tempo da abertura, comum ao palco (partículas) e ao texto (scene-driver).
 * Seis estados: 0 esfera com o "M", 1 coluna, 2 figura, 3 joelho, 4 anel, 5 a esfera de volta.
 * Entre dois estados (um "segmento") a forma se desfaz em nuvem no meio (t ≈ 0,5) e se refaz no fim.
 * Os últimos 2% da rolagem seguram a esfera final antes de a página continuar (pouca rolagem depois dela).
 */
export const SEGMENTS = 5;
const END = 0.98;
/** Progresso em que a primeira forma (coluna) está montada, com a frase 1 na tela. */
export const FIRST_SHAPE = END / SEGMENTS;

export function timeline(p: number): { seg: number; t: number } {
  if (p >= END) return { seg: SEGMENTS - 1, t: 1 };
  const x = (Math.max(0, p) / END) * SEGMENTS;
  const seg = Math.min(SEGMENTS - 1, Math.floor(x));
  return { seg, t: x - seg };
}

/** Quadro de texto ativo: 0 = abertura, 1–4 = frases (com a forma montada), -1 = nuvem ou esfera final (sem texto). */
export function frameAt(p: number): number {
  const { seg, t } = timeline(p);
  if (seg === 0 && t < 0.24) return 0;
  if (t > 0.76 && seg + 1 <= 4) return seg + 1;
  if (t < 0.24 && seg >= 1) return seg;
  return -1;
}
