"use client";

import { Moon, Sun } from "lucide-react";
import { centerOf, trocarTema } from "@/lib/theme";
import { cx } from "./ui";

/** Botão de tema de todas as telas: o tema novo se abre num círculo a partir do centro do próprio botão. */
export function ThemeToggle({ className }: { className?: string }) {
  return (
    <button type="button" onClick={(e) => { const c = centerOf(e.currentTarget); trocarTema(c.x, c.y); }} aria-label="Alternar tema claro e escuro" className={cx("flex size-11 items-center justify-center rounded-full text-ink-2", className)}>
      <Sun strokeWidth={1.5} className="theme-sun size-5" />
      <Moon strokeWidth={1.5} className="theme-moon size-5" />
    </button>
  );
}
