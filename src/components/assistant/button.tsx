"use client";

import { Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";

// O painel (conversa, gráficos, exportação) só baixa no primeiro clique
const Panel = dynamic(() => import("./panel"), { ssr: false });

/** Pílula no canto inferior direito, para admin e recepção. No celular fica acima da barra de abas. */
export function AssistantButton() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); button.current?.focus(); };
  return (
    <>
      <button ref={button} type="button" aria-haspopup="dialog" aria-expanded={open} aria-label="Assistente de análises"
        onClick={() => { setLoaded(true); setOpen((o) => !o); }}
        className="assistant-fab fixed right-4 z-40 flex h-12 items-center gap-2 rounded-full bg-accent-fill px-4 font-semibold text-on-accent shadow-[var(--shadow)] transition-transform active:scale-95 lg:right-6">
        <Sparkles strokeWidth={1.8} className="size-5" />
        <span className="hidden sm:inline">Assistente</span>
      </button>
      {loaded && <Panel open={open} onClose={close} anchor={button} />}
    </>
  );
}
