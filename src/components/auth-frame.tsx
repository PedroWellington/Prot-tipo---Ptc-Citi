import type { ReactNode } from "react";
import { ThemeToggle } from "./theme-toggle";
import { Logo } from "./ui";

export function AuthFrame({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-10 flex items-center justify-between">
        <Logo size={30} />
        <ThemeToggle className="-mr-2" />
      </div>
      <div>
        <h1 className="font-display text-[40px] leading-[1.05]">{title}</h1>
        {subtitle && <p className="mt-3 text-ink-2">{subtitle}</p>}
        <div className="hairline my-6 w-16" />
        {children}
      </div>
    </main>
  );
}
