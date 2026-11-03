/**
 * Desenha um item das Análises num canvas, com layout próprio de exportação (não é print da tela),
 * e devolve o PNG. Carregado por import dinâmico só quando alguém clica em "Baixar PNG". Nada sai do navegador.
 */
import { EXPORT_SCALE, EXPORT_WIDTH, FOOTER_NOTE, scrub, stamp, type ExportBody, type ExportSpec } from "./exportar";

export type Palette = { bg: string; card: string; ink: string; ink2: string; ink3: string; line: string; series: string[]; band: string };
export type Fonts = { sans: string; display: string };

/** O que o desenho usa do contexto 2D: os testes passam um contexto falso que grava as chamadas. */
export type Ctx = Pick<CanvasRenderingContext2D,
  "fillRect" | "fillText" | "measureText" | "beginPath" | "moveTo" | "lineTo" | "stroke" | "fill" | "closePath" | "setLineDash" | "save" | "restore" | "scale"> & {
  fillStyle: string | CanvasGradient | CanvasPattern; strokeStyle: string | CanvasGradient | CanvasPattern;
  font: string; lineWidth: number; textAlign: CanvasTextAlign; textBaseline: CanvasTextBaseline;
};

const M = 56; // margem
const INNER = EXPORT_WIDTH - 2 * M;

function wrap(ctx: Ctx, text: string, width: number) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const w of para.split(" ")) {
      const t = line ? `${line} ${w}` : w;
      if (ctx.measureText(t).width > width && line) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}

/** Desenha (ou só mede, se `draw` for falso) e devolve a altura usada. */
function body(ctx: Ctx, b: ExportBody, y: number, pal: Palette, f: Fonts, draw: boolean): number {
  const text = (s: string, x: number, yy: number, font: string, color: string, align: CanvasTextAlign = "left") => {
    if (!draw) return;
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
    ctx.fillText(scrub(s), x, yy);
  };
  const rect = (x: number, yy: number, w: number, h: number, color: string) => { if (draw) { ctx.fillStyle = color; ctx.fillRect(x, yy, w, h); } };

  switch (b.kind) {
    case "stats": {
      const cols = b.items.length === 4 ? 2 : Math.min(3, b.items.length), gap = 20, w = (INNER - gap * (cols - 1)) / cols, h = 128;
      b.items.forEach((it, i) => {
        const x = M + (i % cols) * (w + gap), yy = y + Math.floor(i / cols) * (h + gap);
        rect(x, yy, w, h, pal.card);
        rect(x, yy, w, 4, pal.series[i % pal.series.length]);
        text(it.label, x + 24, yy + 42, `500 18px ${f.sans}`, pal.ink2);
        text(it.value, x + 24, yy + 88, `400 40px ${f.display}`, pal.ink);
        if (it.hint) text(it.hint, x + 24, yy + 114, `400 15px ${f.sans}`, pal.ink3);
      });
      return Math.ceil(b.items.length / cols) * (h + gap) - gap;
    }
    case "bars": {
      const max = Math.max(1e-9, ...b.rows.map((r) => r.value));
      b.rows.forEach((r, i) => {
        const yy = y + i * 64;
        text(r.label, M, yy + 22, `500 19px ${f.sans}`, pal.ink);
        text(r.display, M + INNER, yy + 22, `600 19px ${f.sans}`, pal.ink, "right");
        rect(M, yy + 34, INNER, 14, pal.line);
        rect(M, yy + 34, Math.max(2, (r.value / max) * INNER), 14, pal.series[i % pal.series.length]);
      });
      return b.rows.length * 64 - 8;
    }
    case "columns": {
      const h = 320, max = Math.max(1e-9, ...b.rows.flatMap((r) => r.values)), slot = INNER / b.rows.length;
      b.series.forEach((s, i) => { rect(M + i * 200, y, 16, 16, pal.series[i]); text(s, M + i * 200 + 24, y + 14, `500 17px ${f.sans}`, pal.ink2); });
      const base = y + 40 + h;
      for (const g of [0, 0.5, 1]) {
        rect(M, base - g * h, INNER, 1, pal.line);
        text(`${Math.round(max * g)}${b.suffix ?? ""}`, M - 8, base - g * h + 5, `400 14px ${f.sans}`, pal.ink3, "right");
      }
      b.rows.forEach((r, i) => {
        const bw = Math.min(28, (slot - 16) / r.values.length);
        r.values.forEach((v, j) => rect(M + i * slot + slot / 2 - (bw * r.values.length) / 2 + j * bw, base - (v / max) * h, bw - 3, (v / max) * h, pal.series[j]));
        text(r.label, M + i * slot + slot / 2, base + 24, `500 15px ${f.sans}`, pal.ink2, "center");
      });
      return 40 + h + 34;
    }
    case "line": {
      const h = 340, pts = b.points, xs = pts.length;
      const max = Math.max(1e-9, ...pts.flatMap((p) => [p.realized ?? 0, p.hi ?? 0, p.expected ?? 0]));
      const X = (i: number) => M + 60 + (i / Math.max(1, xs - 1)) * (INNER - 60);
      const Y = (v: number) => y + 40 + h - (v / max) * h;
      const legend: [string, string][] = [["Realizada", pal.series[0]], ["Prevista", pal.series[1]], ["Faixa de 80%", pal.band]];
      legend.forEach(([l, c], i) => { rect(M + i * 220, y, 16, 16, c); text(l, M + i * 220 + 24, y + 14, `500 17px ${f.sans}`, pal.ink2); });
      for (const g of [0, 0.5, 1]) {
        rect(M + 60, Y(max * g), INNER - 60, 1, pal.line);
        text(b.money ? (g ? `R$ ${Math.round((max * g) / 1000)} mil` : "R$ 0") : String(Math.round(max * g)), M + 52, Y(max * g) + 5, `400 14px ${f.sans}`, pal.ink3, "right");
      }
      if (draw) {
        const band = pts.map((p, i) => [i, p] as const).filter(([, p]) => p.lo !== null && p.hi !== null);
        if (band.length > 1) {
          ctx.beginPath();
          band.forEach(([i, p], k) => (k ? ctx.lineTo(X(i), Y(p.hi!)) : ctx.moveTo(X(i), Y(p.hi!))));
          [...band].reverse().forEach(([i, p]) => ctx.lineTo(X(i), Y(p.lo!)));
          ctx.closePath(); ctx.fillStyle = pal.band; ctx.fill();
        }
        const path = (key: "realized" | "expected", color: string, dash: number[]) => {
          ctx.beginPath(); ctx.setLineDash(dash); ctx.lineWidth = 4; ctx.strokeStyle = color;
          let started = false;
          pts.forEach((p, i) => { const v = p[key]; if (v === null) return; if (started) ctx.lineTo(X(i), Y(v)); else { ctx.moveTo(X(i), Y(v)); started = true; } });
          ctx.stroke(); ctx.setLineDash([]);
        };
        path("realized", pal.series[0], []);
        path("expected", pal.series[1], [12, 8]);
      }
      pts.forEach((p, i) => { if (i === 0 || (i + 1) % 5 === 0) text(String(p.x), X(i), y + 40 + h + 26, `400 14px ${f.sans}`, pal.ink3, "center"); });
      return 40 + h + 36;
    }
    case "table": {
      const n = b.columns.length, colW = INNER / n;
      b.columns.forEach((c, i) => text(c, M + i * colW, y + 20, `600 16px ${f.sans}`, pal.ink3));
      b.rows.forEach((r, ri) => {
        const yy = y + 36 + ri * 48;
        rect(M, yy, INNER, 1, pal.line);
        r.forEach((c, i) => text(c, M + i * colW, yy + 32, `${i === 0 ? 600 : 400} 18px ${f.sans}`, pal.ink));
      });
      return 36 + b.rows.length * 48 + 8;
    }
    case "text": {
      ctx.font = `400 20px ${f.sans}`;
      const lines = b.lines.flatMap((l) => wrap(ctx, l, INNER));
      lines.forEach((l, i) => text(l, M, y + 26 + i * 32, `400 20px ${f.sans}`, pal.ink));
      return lines.length * 32 + 6;
    }
  }
}

function layout(ctx: Ctx, spec: ExportSpec, pal: Palette, f: Fonts, draw: boolean, now: Date) {
  const text = (s: string, x: number, y: number, font: string, color: string) => {
    if (!draw) return;
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillText(scrub(s), x, y);
  };
  let y = M + 40;
  ctx.font = `400 40px ${f.display}`;
  const title = wrap(ctx, spec.title, INNER);
  title.forEach((l, i) => text(l, M, y + i * 48, `400 40px ${f.display}`, pal.ink));
  y += (title.length - 1) * 48 + 36;
  text(`Unidade: ${spec.filters.unidade} · Período: ${spec.filters.periodo}`, M, y, `500 18px ${f.sans}`, pal.ink2);
  y += 40;
  y += body(ctx, spec.body, y, pal, f, draw) + 28;
  if (spec.extra) y += body(ctx, spec.extra, y, pal, f, draw) + 28;
  if (spec.note) {
    ctx.font = `400 16px ${f.sans}`;
    const lines = wrap(ctx, spec.note, INNER);
    lines.forEach((l, i) => text(l, M, y + i * 24, `400 16px ${f.sans}`, pal.ink3));
    y += lines.length * 24 + 16;
  }
  if (draw) { ctx.fillStyle = pal.line; ctx.fillRect(M, y, INNER, 1); }
  text(`Clínica Movimento • gerado em ${stamp(now)} • ${FOOTER_NOTE}`, M, y + 34, `400 15px ${f.sans}`, pal.ink3);
  return y + 34 + M;
}

/** Mede, desenha e devolve a altura em pixels CSS. O canvas recebe largura 1200 × escala. */
export function render(ctx: Ctx, setSize: (w: number, h: number) => void, spec: ExportSpec, pal: Palette, f: Fonts, now = new Date()) {
  const height = Math.ceil(layout(ctx, spec, pal, f, false, now));
  setSize(EXPORT_WIDTH * EXPORT_SCALE, height * EXPORT_SCALE);
  ctx.save();
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, EXPORT_WIDTH, height); // fundo sólido: o PNG nunca sai transparente
  layout(ctx, spec, pal, f, true, now);
  ctx.restore();
  return height;
}

/** Cores do tema lidas de um elemento-sonda com data-theme: o "claro para imprimir" funciona mesmo com a tela no escuro. */
export function readPalette(theme: "light" | "current"): Palette {
  const probe = document.createElement("div");
  if (theme === "light") probe.dataset.theme = "light";
  probe.style.display = "none";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  const pal = {
    bg: v("--surface"), card: v("--surface-2"), ink: v("--ink"), ink2: v("--ink-2"), ink3: v("--ink-3"), line: v("--line"),
    series: [v("--chart-1"), v("--chart-2"), v("--chart-3"), v("--chart-4"), v("--chart-5")], band: v("--accent-soft"),
  };
  probe.remove();
  return pal;
}

export function readFonts(): Fonts {
  const root = getComputedStyle(document.documentElement);
  return {
    sans: `${root.getPropertyValue("--font-instrument-sans").trim() || "system-ui"}, system-ui, sans-serif`,
    display: `${root.getPropertyValue("--font-instrument-serif").trim() || "Georgia"}, Georgia, serif`,
  };
}

/** PNG no navegador: espera as fontes e um quadro livre, desenha fora da tela e devolve o Blob. */
export async function toPng(spec: ExportSpec, theme: "light" | "current"): Promise<Blob> {
  await document.fonts.ready;
  await new Promise<void>((r) => ("requestIdleCallback" in window ? requestIdleCallback(() => r(), { timeout: 200 }) : requestAnimationFrame(() => r())));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Este navegador não consegue gerar imagens.");
  render(ctx, (w, h) => { canvas.width = w; canvas.height = h; }, spec, readPalette(theme), readFonts());
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b && b.size ? resolve(b) : reject(new Error("A imagem saiu vazia. Tente de novo."))), "image/png"));
}
