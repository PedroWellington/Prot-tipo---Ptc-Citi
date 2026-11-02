"use client";

import { Moon, Sun } from "lucide-react";
import { toggleTheme } from "@/lib/theme";
import { cx } from "./ui";

export function ThemeToggle({ className }: { className?: string }) {
  return (
    <button type="button" onClick={toggleTheme} aria-label="Alternar tema claro e escuro" className={cx("flex size-11 items-center justify-center rounded-full text-ink-2", className)}>
      <Sun strokeWidth={1.5} className="theme-sun size-5" />
      <Moon strokeWidth={1.5} className="theme-moon size-5" />
    </button>
  );
}
