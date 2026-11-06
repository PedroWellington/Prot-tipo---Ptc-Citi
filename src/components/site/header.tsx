"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ThemeToggle } from "../theme-toggle";
import { cx, Logo } from "../ui";

export const SECTIONS = [
  ["inicio", "Início"], ["clinica", "A clínica"], ["especialidades", "Especialidades"], ["espaco", "Nosso espaço"],
  ["sistema", "O sistema"], ["equipe", "Equipe"], ["unidades", "Unidades"], ["contato", "Contato"],
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

/** Botão de acesso principal (o único que fica visível durante a cena). */
function EnterButton({ home, onNavigate, className }: { home: string | null; onNavigate?: () => void; className?: string }) {
  return home
    ? <Link href={home} prefetch={false} onClick={onNavigate} className={cx("btn btn-primary min-w-28", className)}>Minha área</Link>
    : <Link href="/login" prefetch={false} onClick={onNavigate} className={cx("btn btn-primary min-w-28", className)}>Entrar</Link>;
}

/**
 * Durante a cena de abertura ("cena"): cabeçalho transparente, só logo, tema e Entrar; os links de seção ficam
 * invisíveis e `inert` (ninguém pula a animação por eles). Quando o palco termina ("completo"), o fundo e o menu
 * descem de cima. Um único IntersectionObserver no marcador do fim do palco decide. Sem palco (sem JS, sem WebGL2,
 * com menos movimento) ou abrindo a página por uma âncora (/#equipe), o menu completo fica sempre.
 */
function useHeaderMode(): "cena" | "completo" | null {
  // null até montar: o HTML do servidor não marca nada como inert (sem JS o menu completo funciona);
  // antes da hidratação, o visual de cena vem só do CSS (.scene-live, posta pelo script inline)
  const [mode, setMode] = useState<"cena" | "completo" | null>(null);
  useEffect(() => {
    const end = document.querySelector("[data-scene-end]");
    const live = document.documentElement.classList.contains("scene-live");
    if (!end || !live || location.hash) {
      const id = requestAnimationFrame(() => setMode("completo"));
      return () => cancelAnimationFrame(id);
    }
    // O marcador fica no fim do palco: entrando na tela por baixo (ou já acima dela), a cena acabou
    const io = new IntersectionObserver(([e]) => setMode(e.isIntersecting || e.boundingClientRect.top < 0 ? "completo" : "cena"));
    io.observe(end);
    return () => io.disconnect();
  }, []);
  return mode;
}

export function SiteHeader() {
  const home = useHome();
  const mode = useHeaderMode();
  const scene = mode === "cena";
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

  // Voltando para a cena com o menu do celular aberto, ele fecha
  const [sheetAt, setSheetAt] = useState(mode);
  if (sheetAt !== mode) { setSheetAt(mode); if (scene && open) setOpen(false); }

  const close = () => setOpen(false);

  return (
    <header className="site-header" data-mode={mode ?? undefined}>
      <a href="#conteudo" className="sr-only rounded-lg bg-accent-fill px-4 py-2 text-on-accent focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50">Pular para o conteúdo</a>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <a href="#inicio" className="logo-shrink shrink-0"><Logo size={22} /></a>
        <nav aria-label="Seções da página" inert={scene} className="header-sections hidden flex-1 justify-center xl:flex">
          <ul className="flex gap-0.5">
            {SECTIONS.map(([id, label], i) => (
              <li key={id} style={{ "--i": i } as CSSProperties}>
                <a href={`#${id}`} aria-current={active === id ? "true" : undefined}
                  className={cx("flex min-h-10 items-center rounded-full px-2.5 text-sm font-medium whitespace-nowrap transition-colors", active === id ? "bg-nav-active text-nav-active-ink" : "text-ink-2 hover:text-ink")}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {/* Durante a cena: tema e Entrar. Depois: "Criar conta" (à esquerda, sem abrir buraco ao lado de Entrar)
            e, no celular, o menu no lugar de Entrar */}
        <div className="ml-auto flex items-center gap-2 xl:ml-0">
          {/* Invólucros controlam a exibição: .btn (CSS global) venceria a classe "hidden" do Tailwind */}
          <span className="header-extra hidden md:inline-flex" inert={scene}>
            <Link href="/cadastro" prefetch={false} className="btn btn-line min-w-28">Criar conta</Link>
          </span>
          <ThemeToggle />
          <span className={mode === "completo" ? "hidden sm:inline-flex" : "inline-flex"}><EnterButton home={home} /></span>
          <button ref={menuButton} type="button" aria-expanded={open} aria-controls="menu-site" aria-label={open ? "Fechar menu" : "Abrir menu"}
            inert={scene} onClick={() => setOpen((o) => !o)} className="header-menu flex size-11 items-center justify-center rounded-full text-ink xl:hidden">
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
        <div className="mt-3 flex flex-col gap-2 border-t border-line pt-4">
          <Link href="/cadastro" prefetch={false} onClick={close} className="btn btn-line min-w-28">Criar conta</Link>
          <EnterButton home={home} onNavigate={close} />
        </div>
      </div>
    </header>
  );
}
