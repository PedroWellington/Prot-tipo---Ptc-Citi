"use client";

import { Moon, Sun } from "lucide-react";
import { centerOf, toggleTheme } from "@/lib/theme";
import { cx } from "./ui";

/** `reveal`: no app, o tema novo se abre num círculo a partir do botão. Na página pública e no login, troca direto. */
export function ThemeToggle({ className, reveal }: { className?: string; reveal?: boolean }) {
  return (
    <button type="button" onClick={(e) => (reveal ? toggleTheme(centerOf(e.currentTarget)) : toggleTheme())} aria-label="Alternar tema claro e escuro" className={cx("flex size-11 items-center justify-center rounded-full text-ink-2", className)}>
      <Sun strokeWidth={1.5} className="theme-sun size-5" />
      <Moon strokeWidth={1.5} className="theme-moon size-5" />
    </button>
  );
}
