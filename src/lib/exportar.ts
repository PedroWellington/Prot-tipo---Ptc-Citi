/**
 * Exportação de um item das Análises como PNG: tipos, nome do arquivo e privacidade. Leve e puro;
 * o desenho no canvas fica em exportar-png.ts, carregado só no clique.
 */

export type ExportBody =
  | { kind: "stats"; items: { label: string; value: string; hint?: string }[] }
  | { kind: "bars"; rows: { label: string; value: number; display: string }[] }
  | { kind: "columns"; series: string[]; rows: { label: string; values: number[] }[]; suffix?: string }
  | { kind: "line"; points: { x: number; realized: number | null; expected: number | null; lo: number | null; hi: number | null }[]; money?: boolean }
  | { kind: "table"; columns: string[]; rows: string[][]; nameCol?: number }
  | { kind: "text"; lines: string[] };

export type ExportSpec = {
  /** Vira parte do nome do arquivo: "receita-prevista". */
  item: string;
  title: string;
  filters: { unidade: string; periodo: string };
  body: ExportBody;
  /** Texto de apoio abaixo do conteúdo (ex.: legenda, como calculamos). */
  note?: string;
  /** Respostas do assistente podem ter números e barras juntos. */
  extra?: ExportBody;
  /** Nomes de pacientes citados em qualquer texto do item: saem como iniciais, salvo "Incluir nomes". */
  names?: string[];
};

export const FOOTER_NOTE = "Estimativa estatística com dados fictícios de demonstração";
export const EXPORT_WIDTH = 1200;
export const EXPORT_SCALE = 2;

/** Sem acento, minúsculas, só [a-z0-9-]: nomes de arquivo iguais em qualquer sistema. */
export const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** analises-<item>-<unidade>-<periodo>-<AAAA-MM-DD>.png */
export const exportFileName = (spec: Pick<ExportSpec, "item" | "filters">, now = new Date()) =>
  `analises-${slug(spec.item)}-${slug(spec.filters.unidade)}-${slug(spec.filters.periodo)}-${ymd(now)}.png`;

export const stamp = (d = new Date()) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const PHONE = /(\(?\b\d{2}\)?\s?)?\b9?\d{4}[-\s]?\d{4}\b/g;
/** Última barreira: nenhum texto do PNG carrega CPF, e-mail ou telefone, mesmo que entre por engano. */
export const scrub = (s: string) => s.replace(EMAIL, "•••").replace(CPF, "•••").replace(PHONE, "•••");

/** "Helvira Lindoval" → "H. L." */
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => `${w[0].toUpperCase()}.`).join(" ");

/** Por padrão a lista sai sem nomes: só iniciais e posição. Com nomes, quem exporta precisa marcar e a exportação é auditada. */
export function applyPrivacy(spec: ExportSpec, includeNames: boolean): ExportSpec {
  if (includeNames) return spec;
  const named = [...(spec.names ?? [])].sort((a, b) => b.length - a.length);
  const hide = (s: string) => named.reduce((acc, n) => acc.split(n).join(initials(n)), s);
  const mask = (b: ExportBody): ExportBody => {
    switch (b.kind) {
      case "table": return { ...b, rows: b.rows.map((r, i) => r.map((c, j) => (j === b.nameCol ? `#${i + 1} ${initials(c)}` : hide(c)))) };
      case "bars": return { ...b, rows: b.rows.map((r, i) => ({ ...r, label: spec.item.includes("pacientes") ? `#${i + 1} ${initials(r.label)}` : hide(r.label) })) };
      case "stats": return { ...b, items: b.items.map((it) => ({ ...it, label: hide(it.label), value: hide(it.value), hint: it.hint && hide(it.hint) })) };
      case "text": return { ...b, lines: b.lines.map(hide) };
      default: return b;
    }
  };
  return { ...spec, title: hide(spec.title), note: spec.note && hide(spec.note), body: mask(spec.body), extra: spec.extra && mask(spec.extra), names: undefined };
}

export const hasNames = (spec: ExportSpec) =>
  (spec.body.kind === "table" && spec.body.nameCol !== undefined) || !!spec.names?.length || spec.item.includes("pacientes");
