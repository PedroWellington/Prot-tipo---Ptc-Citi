// Gera as formas da abertura em partículas: npm run particulas
// Cada forma é desenhada com primitivas simples (círculo, cápsula, retângulo arredondado, setor de anel), amostrada
// com mais densidade nos contornos, embaralhada (qualquer prefixo representa a forma inteira) e quantizada em 8 bits.
// Saída (servida estática, carregada sob demanda pelo palco):
//   public/site/particulas-v1-6000.json e -2000.json   pontos de todas as formas
//   public/site/formas-v1/<forma>.svg                  desenho estático (menos movimento, sem JS, sem WebGL)
// Nomes com versão: /site tem cache imutável de 1 ano. Ao mudar as formas, suba a versão aqui e em particle-stage.ts.
import { mkdir, writeFile } from "node:fs/promises";
import { amostrar, VARIANTE_PADRAO } from "../src/lib/marca";

type V = [number, number];
type Prim =
  | { k: "c"; c: V; r: number; over?: boolean }
  | { k: "cap"; a: V; b: V; r: number; over?: boolean }
  | { k: "rr"; c: V; hw: number; hh: number; r: number; over?: boolean }
  | { k: "arc"; c: V; R: number; w: number; a0: number; a1: number; over?: boolean };

// PRNG determinístico: a mesma saída a cada execução
let seed = 20261105;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

const len = (x: number, y: number) => Math.hypot(x, y);
function sdf(p: Prim, x: number, y: number): number {
  if (p.k === "c") return len(x - p.c[0], y - p.c[1]) - p.r;
  if (p.k === "cap") {
    const [ax, ay] = p.a, [bx, by] = p.b;
    const px = x - ax, py = y - ay, dx = bx - ax, dy = by - ay;
    const h = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));
    return len(px - dx * h, py - dy * h) - p.r;
  }
  if (p.k === "rr") {
    const qx = Math.abs(x - p.c[0]) - p.hw + p.r, qy = Math.abs(y - p.c[1]) - p.hh + p.r;
    return len(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - p.r;
  }
  // Setor de anel com pontas retas: distância ao anel limitada pelos ângulos
  const dx = x - p.c[0], dy = y - p.c[1];
  let a = Math.atan2(dy, dx);
  while (a < p.a0) a += 2 * Math.PI;
  const inside = a <= p.a1;
  const ring = Math.abs(len(dx, dy) - p.R) - p.w / 2;
  if (inside) return ring;
  const end = (ang: number) => { const ex = p.c[0] + Math.cos(ang) * p.R, ey = p.c[1] + Math.sin(ang) * p.R; return len(x - ex, y - ey) - p.w / 2; };
  return Math.min(end(p.a0), end(p.a1));
}

/** Pontos sobre a borda de uma primitiva, espaçados por `step`. */
function borda(p: Prim, step: number): V[] {
  const out: V[] = [];
  const circle = (cx: number, cy: number, r: number, a0 = 0, a1 = 2 * Math.PI) => {
    const n = Math.max(6, Math.ceil(((a1 - a0) * r) / step));
    for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  };
  const line = (a: V, b: V) => {
    const n = Math.max(1, Math.ceil(len(b[0] - a[0], b[1] - a[1]) / step));
    for (let i = 0; i <= n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  };
  if (p.k === "c") circle(p.c[0], p.c[1], p.r);
  else if (p.k === "cap") {
    const [ax, ay] = p.a, [bx, by] = p.b;
    const ang = Math.atan2(by - ay, bx - ax), nx = -Math.sin(ang) * p.r, ny = Math.cos(ang) * p.r;
    line([ax + nx, ay + ny], [bx + nx, by + ny]);
    line([ax - nx, ay - ny], [bx - nx, by - ny]);
    circle(ax, ay, p.r, ang + Math.PI / 2, ang + (3 * Math.PI) / 2);
    circle(bx, by, p.r, ang - Math.PI / 2, ang + Math.PI / 2);
  } else if (p.k === "rr") {
    const { c: [cx, cy], hw, hh, r } = p;
    line([cx - hw + r, cy - hh], [cx + hw - r, cy - hh]); line([cx - hw + r, cy + hh], [cx + hw - r, cy + hh]);
    line([cx - hw, cy - hh + r], [cx - hw, cy + hh - r]); line([cx + hw, cy - hh + r], [cx + hw, cy + hh - r]);
    circle(cx + hw - r, cy - hh + r, r, -Math.PI / 2, 0); circle(cx + hw - r, cy + hh - r, r, 0, Math.PI / 2);
    circle(cx - hw + r, cy + hh - r, r, Math.PI / 2, Math.PI); circle(cx - hw + r, cy - hh + r, r, Math.PI, 1.5 * Math.PI);
  } else {
    circle(p.c[0], p.c[1], p.R - p.w / 2, p.a0, p.a1); circle(p.c[0], p.c[1], p.R + p.w / 2, p.a0, p.a1);
    for (const a of [p.a0, p.a1]) line([p.c[0] + Math.cos(a) * (p.R - p.w / 2), p.c[1] + Math.sin(a) * (p.R - p.w / 2)], [p.c[0] + Math.cos(a) * (p.R + p.w / 2), p.c[1] + Math.sin(a) * (p.R + p.w / 2)]);
  }
  return out;
}

/** n pontos: 70% nos contornos visíveis (o que fica dentro de outra peça some), 30% no interior. */
function amostrarForma(prims: Prim[], n: number): V[] {
  const uniao = (x: number, y: number, skip?: Prim) => prims.reduce((m, p) => (p === skip ? m : Math.min(m, sdf(p, x, y))), Infinity);
  const contorno: V[] = [];
  for (const p of prims) for (const q of borda(p, 0.004)) if (p.over || uniao(q[0], q[1], p) > -0.004) contorno.push(q);
  const pts: V[] = [];
  const nC = Math.round(n * 0.7);
  for (let i = 0; i < nC; i++) {
    const q = contorno[Math.floor(rnd() * contorno.length)];
    pts.push([q[0] + (rnd() - 0.5) * 0.018, q[1] + (rnd() - 0.5) * 0.018]);
  }
  while (pts.length < n) {
    const x = rnd() * 2 - 1, y = rnd() * 2 - 1;
    if (uniao(x, y) < 0) pts.push([x, y]);
  }
  return pts;
}

// ── Formas (coordenadas de -1 a 1, y para baixo) ─────────────────────────────
const deg = (d: number) => (d * Math.PI) / 180;

/** Coluna vertebral em leve S: sete vértebras empilhadas com processos laterais e discos entre elas. */
function coluna(): Prim[] {
  const out: Prim[] = [];
  for (let k = 0; k < 7; k++) {
    const y = -0.84 + k * 0.28, x = 0.1 * Math.sin(y * 2.2), hw = 0.17 + k * 0.012;
    out.push({ k: "rr", c: [x, y], hw, hh: 0.095, r: 0.045 });
    out.push({ k: "cap", a: [x - hw, y - 0.01], b: [x - hw - 0.15, y + 0.04], r: 0.025 });
    out.push({ k: "cap", a: [x + hw, y - 0.01], b: [x + hw + 0.15, y + 0.04], r: 0.025 });
    if (k < 6) out.push({ k: "cap", a: [x - hw * 0.7, y + 0.14], b: [x + hw * 0.7, y + 0.14], r: 0.012, over: true });
  }
  return out;
}

/** Figura humana em alongamento (avanço com braços para cima), silhueta abstrata e sem rosto. */
function figura(): Prim[] {
  return [
    { k: "c", c: [0.02, -0.76], r: 0.12 },
    { k: "cap", a: [0.02, -0.58], b: [0.06, -0.06], r: 0.115 },
    { k: "cap", a: [-0.02, -0.52], b: [-0.42, -0.95], r: 0.05 },
    { k: "cap", a: [0.08, -0.52], b: [0.48, -0.92], r: 0.05 },
    { k: "cap", a: [0.08, -0.06], b: [0.44, 0.3], r: 0.07 },
    { k: "cap", a: [0.44, 0.3], b: [0.46, 0.88], r: 0.058 },
    { k: "cap", a: [0.46, 0.9], b: [0.64, 0.92], r: 0.035 },
    { k: "cap", a: [0.02, -0.04], b: [-0.32, 0.4], r: 0.07 },
    { k: "cap", a: [-0.32, 0.4], b: [-0.66, 0.86], r: 0.055 },
  ];
}

/** Joelho de frente: fêmur com côndilos, patela, menisco, tíbia e fíbula. */
function joelho(): Prim[] {
  return [
    { k: "cap", a: [0, -1], b: [0, -0.36], r: 0.16 },
    { k: "c", c: [-0.17, -0.22], r: 0.2 },
    { k: "c", c: [0.17, -0.22], r: 0.2 },
    { k: "c", c: [0, -0.3], r: 0.12, over: true },
    { k: "cap", a: [-0.38, 0.04], b: [0.38, 0.04], r: 0.022, over: true },
    { k: "rr", c: [0, 0.16], hw: 0.4, hh: 0.08, r: 0.05 },
    { k: "cap", a: [0, 0.2], b: [0.02, 1], r: 0.15 },
    { k: "cap", a: [0.34, 0.24], b: [0.31, 0.96], r: 0.05 },
  ];
}

/** Anel de progresso com as 10 sessões completas e um "feito" no centro (tratamento até o fim). */
function anel(): Prim[] {
  const out: Prim[] = [];
  for (let i = 0; i < 10; i++) {
    const a0 = deg(-90 + i * 36 + 3.5), a1 = deg(-90 + (i + 1) * 36 - 3.5);
    out.push({ k: "arc", c: [0, 0], R: 0.8, w: 0.14, a0, a1 });
  }
  out.push({ k: "cap", a: [-0.32, 0.02], b: [-0.08, 0.26], r: 0.06 });
  out.push({ k: "cap", a: [-0.08, 0.26], b: [0.36, -0.22], r: 0.06 });
  return out;
}

/** Esfera de pontos (Fibonacci) com o monograma "M" desenhado por partículas mais densas na frente. */
function esfera(n: number): [number, number, number, number][] {
  const nM = Math.round(n * 0.26), nS = n - nM;
  const out: [number, number, number, number][] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < nS; i++) {
    const y = 1 - (i / (nS - 1)) * 2, r = Math.sqrt(1 - y * y), t = golden * i;
    out.push([Math.cos(t) * r, y, Math.sin(t) * r, 0]);
  }
  const traco = amostrar(VARIANTE_PADRAO, 0.2);
  const escala = 0.62 / 16; // o M ocupa de 8 a 40 no quadro de 48 (meia largura 16)
  for (let i = 0; i < nM; i++) {
    const [mx, my] = traco[Math.floor(rnd() * traco.length)];
    const ang = rnd() * 2 * Math.PI, raio = Math.sqrt(rnd()) * 1.3; // dentro do traço, mais fino que ele: o "M" fica nítido
    out.push([(mx - 24 + Math.cos(ang) * raio) * escala, (my - 24 + Math.sin(ang) * raio) * escala, 1, 1]);
  }
  return out;
}

function embaralhar<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const q8 = (v: number) => Math.max(-127, Math.min(127, Math.round(v * 127)));
const b64 = (vals: number[]) => Buffer.from(Int8Array.from(vals).buffer).toString("base64");

/** Desenho estático: ~900 triângulos pequenos, nas cores claras da paleta (o fundo é sempre a banda escura). */
function svgEstatico(pts: V[], destaque: V[] = []): string {
  const cores = ["#5fe9dc", "#4aa8ff", "#bff6f0", "#19d3c5"];
  const grupos = cores.map(() => [] as string[]);
  const tri = (x: number, y: number, s: number) => {
    const a = rnd() * 2 * Math.PI;
    const v = [0, 1, 2].map((k) => [x + Math.cos(a + (k * 2 * Math.PI) / 3) * s, y + Math.sin(a + (k * 2 * Math.PI) / 3) * s].map((n) => n.toFixed(2)).join(" "));
    return `M${v[0]}L${v[1]}L${v[2]}Z`;
  };
  pts.slice(0, 700).forEach(([x, y], i) => grupos[i % 3 === 0 ? 1 : i % 3 === 1 ? 0 : 3].push(tri(x, y, 0.018)));
  // Monograma: mais denso e no tom mais claro, para ler o "M" no meio da esfera
  destaque.forEach(([x, y]) => grupos[2].push(tri(x, y, 0.02)));
  const paths = grupos.map((d, i) => `<path fill="${cores[i]}" fill-opacity=".85" d="${d.join("")}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1.1 -1.1 2.2 2.2">${paths}</svg>`;
}

async function main() {
  const MAX = 6000;
  const formas: Record<string, V[]> = {
    coluna: embaralhar(amostrarForma(coluna(), MAX)),
    figura: embaralhar(amostrarForma(figura(), MAX)),
    joelho: embaralhar(amostrarForma(joelho(), MAX)),
    anel: embaralhar(amostrarForma(anel(), MAX)),
  };
  const sfera = embaralhar(esfera(MAX));
  await mkdir("public/site/formas-v1", { recursive: true });
  for (const n of [6000, 2000]) {
    const json = {
      v: 1, n,
      // esfera: x, y, z, M (1 = ponto do monograma); demais: x, y. Valores de -127 a 127 (÷127 = coordenada)
      esfera: b64(sfera.slice(0, n).flatMap(([x, y, z, m]) => [q8(x), q8(y), q8(z), m])),
      ...Object.fromEntries(Object.entries(formas).map(([k, pts]) => [k, b64(pts.slice(0, n).flatMap(([x, y]) => [q8(x), q8(y)]))])),
    };
    await writeFile(`public/site/particulas-v1-${n}.json`, JSON.stringify(json));
  }
  for (const [k, pts] of Object.entries(formas)) await writeFile(`public/site/formas-v1/${k}.svg`, svgEstatico(pts));
  // Esfera estática: só a metade da frente (a de trás embolaria o M) e o monograma por cima
  const frente = sfera.filter(([, , z, m]) => !m && z > 0).map(([x, y]) => [x * 0.9, y * 0.9] as V);
  const m = sfera.filter(([, , , mm]) => mm).slice(0, 500).map(([x, y]) => [x * 0.9, y * 0.9] as V);
  await writeFile("public/site/formas-v1/esfera.svg", svgEstatico(frente, m));
  console.log("formas geradas:", Object.keys(formas).concat("esfera").join(", "));
}

void main();
