"use client";

import { Download, Share2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { applyPrivacy, exportFileName, hasNames, type ExportSpec } from "@/lib/exportar";
import type { Tone } from "@/lib/labels";
import { cx } from "./ui";

/** Compartilhar arquivos (celular): só aparece onde o navegador suporta. O menu só existe no cliente. */
const shareable = () => {
  try { return !!navigator.canShare?.({ files: [new File([""], "x.png", { type: "image/png" })] }); } catch { return false; }
};

async function build(spec: ExportSpec, theme: "light" | "current", includeNames: boolean) {
  const { toPng } = await import("@/lib/exportar-png");
  const safe = applyPrivacy(spec, includeNames);
  if (includeNames && hasNames(spec)) await api("/analytics/export-audit", { body: { item: spec.item } });
  return { blob: await toPng(safe, theme), name: exportFileName(spec) };
}

/** Botão de um item só: abre um menu pequeno com o tema e, em listas de pacientes, "Incluir nomes". */
export function ExportButton({ spec, className }: { spec: () => ExportSpec; className?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<"light" | "current">("light");
  const [names, setNames] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const withNames = open && hasNames(spec());

  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", off);
    document.addEventListener("keydown", off);
    return () => { document.removeEventListener("pointerdown", off); document.removeEventListener("keydown", off); };
  }, [open]);

  const run = async (share: boolean) => {
    setBusy(true);
    try {
      const { blob, name } = await build(spec(), theme, names);
      const file = new File([blob], name, { type: "image/png" });
      if (share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: spec().title }).catch(() => {});
      } else {
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement("a"), { href: url, download: name });
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast.success("Imagem baixada");
      }
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar a imagem.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={root} className={cx("export-btn", className ?? "relative")}>
      <button type="button" aria-label="Baixar este gráfico como imagem" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}
        className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-ink-2 transition-transform active:scale-95">
        <Download strokeWidth={1.8} className="size-[18px]" />
      </button>
      {open && (
        <div id={id} role="dialog" aria-label="Baixar PNG" className="pop-in absolute top-12 right-0 z-30 flex w-64 flex-col gap-2 rounded-2xl border border-line-strong bg-surface p-3 text-sm shadow-2xl">
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-xs font-semibold text-ink-3">Cores da imagem</legend>
            {([["light", "Tema claro (para imprimir)"], ["current", "Tema atual"]] as const).map(([v, l]) => (
              <label key={v} className="flex min-h-9 items-center gap-2"><input type="radio" name={`${id}-t`} checked={theme === v} onChange={() => setTheme(v)} className="size-4 accent-[var(--accent)]" />{l}</label>
            ))}
          </fieldset>
          {withNames && (
            <label className="flex min-h-9 items-center gap-2 border-t border-line pt-2">
              <input type="checkbox" checked={names} onChange={(e) => setNames(e.target.checked)} className="size-4 accent-[var(--accent)]" />
              Incluir nomes <span className="text-xs text-ink-3">(fica no log)</span>
            </label>
          )}
          <button type="button" disabled={busy} onClick={() => run(false)} className="btn btn-primary min-h-10 w-full text-sm">
            <Download strokeWidth={1.8} className="size-4" />{busy ? "Gerando…" : "Baixar PNG"}
          </button>
          {shareable() && <button type="button" disabled={busy} onClick={() => run(true)} className="btn btn-line min-h-10 w-full text-sm"><Share2 strokeWidth={1.8} className="size-4" />Compartilhar</button>}
        </div>
      )}
    </div>
  );
}

/** Cartão com o botão no canto: aparece ao passar o mouse ou focar; no toque fica sempre visível. */
export function ExportCard({ spec, className, tone, children }: { spec: () => ExportSpec; className?: string; tone?: Tone; children: ReactNode }) {
  return (
    <section data-tone={tone} className={cx("export-card card relative p-5 sm:p-6", tone && "stripe", className)}>
      <ExportButton spec={spec} className="absolute top-3 right-3" />
      {children}
    </section>
  );
}
