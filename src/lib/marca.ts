/**
 * Geometria do monograma "M" da Movimento, num quadro de 48 × 48, traço único de espessura uniforme e pontas redondas.
 * Fonte única: o SVG da interface (MarcaMovimento), os ícones do PWA (scripts/gerar-icones.ts) e as partículas da
 * abertura (scripts/gerar-particulas.ts) leem daqui. Nenhuma variante tem o "V" reto central nem lembra um envelope.
 *
 * A "pulso": duas ondas arredondadas que sobem e descem como um batimento, com o vale central suave e alto.
 * B "articulação": dois arcos que se apoiam num pequeno círculo central, como uma junta.
 * C "coluna": pernas curvas para dentro e, no meio, três vértebras empilhadas.
 */
export type Variante = "A" | "B" | "C";
export const VARIANTE_PADRAO: Variante = "A";
export const VARIANTES: Variante[] = ["A", "B", "C"];
export const NOME_VARIANTE: Record<Variante, string> = { A: "Pulso", B: "Articulação", C: "Coluna" };

type P = [number, number];
/** L: reta; C: cúbica (início, controle 1, controle 2, fim); O: círculo (centro, raio). */
export type Trecho = { t: "L"; p: [P, P] } | { t: "C"; p: [P, P, P, P] } | { t: "O"; c: P; r: number };

export const TRACO = 4.2;

export const GEOMETRIA: Record<Variante, Trecho[]> = {
  A: [
    { t: "L", p: [[8, 40], [8, 20]] },
    { t: "C", p: [[8, 20], [8, 11], [20, 11], [20, 20]] },
    { t: "C", p: [[20, 20], [20, 26], [28, 26], [28, 20]] },
    { t: "C", p: [[28, 20], [28, 11], [40, 11], [40, 20]] },
    { t: "L", p: [[40, 20], [40, 40]] },
  ],
  B: [
    { t: "L", p: [[8, 40], [8, 20]] },
    { t: "C", p: [[8, 20], [8, 11], [20, 11], [20.4, 21]] },
    { t: "O", c: [24, 24.6], r: 4.4 },
    { t: "C", p: [[27.6, 21], [28, 11], [40, 11], [40, 20]] },
    { t: "L", p: [[40, 20], [40, 40]] },
  ],
  C: [
    { t: "C", p: [[8, 40], [8, 22], [9, 10], [17, 10]] },
    { t: "C", p: [[17, 10], [20, 10], [21, 12], [21, 15]] },
    { t: "C", p: [[40, 40], [40, 22], [39, 10], [31, 10]] },
    { t: "C", p: [[31, 10], [28, 10], [27, 12], [27, 15]] },
    { t: "L", p: [[21.5, 21.5], [26.5, 21.5]] },
    { t: "L", p: [[21.5, 28], [26.5, 28]] },
    { t: "L", p: [[21.5, 34.5], [26.5, 34.5]] },
  ],
};

const f = (n: number) => Number(n.toFixed(2));

/** Caminhos SVG (um por trecho contínuo) para desenhar com stroke. */
export function caminhos(v: Variante): string[] {
  const out: string[] = [];
  let atual = "";
  let fim: P | null = null;
  const fecha = () => { if (atual) out.push(atual); atual = ""; fim = null; };
  for (const s of GEOMETRIA[v]) {
    if (s.t === "O") {
      fecha();
      const [cx, cy] = s.c;
      out.push(`M${f(cx - s.r)} ${f(cy)}a${s.r} ${s.r} 0 1 0 ${f(2 * s.r)} 0a${s.r} ${s.r} 0 1 0 ${f(-2 * s.r)} 0`);
      continue;
    }
    const ini = s.p[0];
    if (!fim || fim[0] !== ini[0] || fim[1] !== ini[1]) { fecha(); atual = `M${f(ini[0])} ${f(ini[1])}`; }
    atual += s.t === "L" ? `L${f(s.p[1][0])} ${f(s.p[1][1])}` : `C${s.p.slice(1).map(([x, y]) => `${f(x)} ${f(y)}`).join(" ")}`;
    fim = s.p[s.p.length - 1];
  }
  fecha();
  return out;
}

/** Pontos ao longo do traço (passo em unidades do quadro de 48), para as partículas. */
export function amostrar(v: Variante, passo = 0.35): P[] {
  const pts: P[] = [];
  for (const s of GEOMETRIA[v]) {
    if (s.t === "O") {
      const n = Math.ceil((2 * Math.PI * s.r) / passo);
      for (let i = 0; i < n; i++) pts.push([s.c[0] + s.r * Math.cos((i / n) * 2 * Math.PI), s.c[1] + s.r * Math.sin((i / n) * 2 * Math.PI)]);
    } else if (s.t === "L") {
      const [[x0, y0], [x1, y1]] = s.p;
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / passo));
      for (let i = 0; i <= n; i++) pts.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
    } else {
      const [a, b, c, d] = s.p;
      const at = (t: number): P => {
        const u = 1 - t;
        return [u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]];
      };
      let len = 0;
      for (let i = 1; i <= 20; i++) { const p0 = at((i - 1) / 20), p1 = at(i / 20); len += Math.hypot(p1[0] - p0[0], p1[1] - p0[1]); }
      const n = Math.max(2, Math.ceil(len / passo));
      for (let i = 0; i <= n; i++) pts.push(at(i / n));
    }
  }
  return pts;
}
