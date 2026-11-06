"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, domMax, LazyMotion, m, useDragControls, useReducedMotion, type PanInfo } from "framer-motion";
import { X } from "lucide-react";

/** Bottom sheet arrastável no celular, modal centrado no desktop. */
export default function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  // Em ref: o pai recria onClose a cada render, e o efeito roubaria o foco de quem está digitando
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  const reduced = useReducedMotion();
  const drag = useDragControls();

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close.current();
      prev?.focus(); // só no teclado: no toque, devolver o foco deixaria o gatilho pronto para reabrir
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 500) onClose();
  };

  return (
    <LazyMotion features={domMax} strict>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
            <m.div className="absolute inset-0 bg-scrim/40" onClick={onClose}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} />
            <m.div ref={panel} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
              className="relative flex max-h-[88dvh] w-full flex-col rounded-t-[20px] border border-line-strong bg-surface shadow-2xl outline-none sm:max-w-lg sm:rounded-b-[20px]"
              initial={reduced ? { opacity: 0 } : { y: "100%" }} animate={reduced ? { opacity: 1 } : { y: 0 }} exit={reduced ? { opacity: 0 } : { y: "100%" }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }} dragControls={drag} dragListener={false} onDragEnd={onDragEnd}>
              <div className="flex cursor-grab touch-none justify-center pt-3 pb-1 sm:hidden" aria-hidden onPointerDown={(e) => drag.start(e)}>
                <span className="h-1 w-10 rounded-full bg-line-strong" />
              </div>
              <header className="flex items-center justify-between gap-4 px-5 pt-2 pb-3 sm:pt-5">
                <h2 className="font-display text-2xl">{title}</h2>
                <button type="button" onClick={onClose} aria-label="Fechar" className="-mr-2 flex size-11 items-center justify-center rounded-full text-ink-2">
                  <X strokeWidth={1.5} className="size-5" />
                </button>
              </header>
              <div className="overflow-y-auto overscroll-contain px-5 pb-[calc(20px+env(safe-area-inset-bottom))]">{children}</div>
            </m.div>
          </div>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}
