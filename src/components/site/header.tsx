"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "../theme-toggle";
import { cx, Logo } from "../ui";

export const SECTIONS = [
  ["inicio", "Início"], ["clinica", "A clínica"], ["especialidades", "Especialidades"], ["espaco", "Nosso espaço"],
  ["equipe", "Equipe"], ["unidades", "Unidades"], ["convenios", "Convênios"], ["contato", "Contato"],
] as const;

/** "Entrar" vira "Minha área" para quem já tem sessão. A página continua estática: a checagem é no navegador. */
function useHome() {
  const [home, setHome] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((u: { home?: string } | null) => { if (alive && u?.home) setHome(u.home); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return home;
}

function AuthButtons({ home, onNavigate, stacked }: { home: string | null; onNavigate?: () => void; stacked?: boolean }) {
  return (
    <div className={cx("flex gap-2", stacked && "flex-col")}>
      {home ? (
        <Link href={home} prefetch={false} onClick={onNavigate} className="btn btn-primary min-w-28">Minha área</Link>
      ) : (
        <>
          <Link href="/cadastro" prefetch={false} onClick={onNavigate} className={cx("btn btn-line min-w-28", !stacked && "hidden md:inline-flex")}>Criar conta</Link>
          <Link href="/login" prefetch={false} onClick={onNavigate} className="btn btn-primary min-w-28">Entrar</Link>
        </>
      )}
    </div>
  );
}

export function SiteHeader() {
  const home = useHome();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string>("inicio");
  const menuButton = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  // Destaca no menu a seção que está no meio da tela
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
    }, { rootMargin: "-45% 0px -50% 0px" });
    for (const [id] of SECTIONS) { const el = document.getElementById(id); if (el) io.observe(el); }
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    sheet.current?.querySelector<HTMLElement>("a")?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); menuButton.current?.focus(); } };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className="site-header sticky top-0 z-40 border-b border-line bg-surface">
      <a href="#conteudo" className="sr-only rounded-lg bg-accent-fill px-4 py-2 text-on-accent focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50">Pular para o conteúdo</a>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <a href="#inicio" className="shrink-0"><Logo size={22} /></a>
        <nav aria-label="Seções da página" className="hidden flex-1 justify-center xl:flex">
          <ul className="flex gap-1">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} aria-current={active === id ? "true" : undefined}
                  className={cx("flex min-h-10 items-center rounded-full px-3 text-sm font-medium transition-colors", active === id ? "bg-nav-active text-nav-active-ink" : "text-ink-2 hover:text-ink")}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-1 xl:ml-0">
          <ThemeToggle />
          <div className="hidden sm:block"><AuthButtons home={home} /></div>
          <button ref={menuButton} type="button" aria-expanded={open} aria-controls="menu-site" aria-label={open ? "Fechar menu" : "Abrir menu"}
            onClick={() => setOpen((o) => !o)} className="flex size-11 items-center justify-center rounded-full text-ink xl:hidden">
            {open ? <X strokeWidth={1.8} className="size-6" /> : <Menu strokeWidth={1.8} className="size-6" />}
          </button>
        </div>
      </div>
      {/* Celular: folha sólida logo abaixo do cabeçalho, com as seções e os botões de acesso */}
      <div id="menu-site" ref={sheet} hidden={!open} className="page-enter border-t border-line bg-surface px-4 pt-2 pb-5 shadow-2xl xl:hidden">
        <nav aria-label="Seções da página (menu)">
          <ul className="flex flex-col">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} onClick={close} aria-current={active === id ? "true" : undefined}
                  className={cx("flex min-h-12 items-center rounded-xl px-3 text-base font-medium", active === id ? "bg-nav-active text-nav-active-ink" : "text-ink")}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-3 border-t border-line pt-4"><AuthButtons home={home} onNavigate={close} stacked /></div>
      </div>
    </header>
  );
}
