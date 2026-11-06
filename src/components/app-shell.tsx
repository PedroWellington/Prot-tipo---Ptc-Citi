"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CalendarClock, CalendarPlus, ChartColumn, ClipboardList, Ellipsis, FileClock, HeartPulse, Home, Hourglass, Lock, LogOut, MapPin, MessageCircle, PanelLeftClose, QrCode, Repeat, Settings, ShieldCheck, SlidersHorizontal, TrendingUp, Type, User, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { memo, useEffect, useRef, useState, ViewTransition, type CSSProperties, type ReactNode } from "react";
import { api } from "@/lib/api";
import { q } from "@/lib/queries";
import { toggleSidebar } from "@/lib/theme";
import { AssistantButton } from "./assistant/button";
import { entryActive, entryReady, playExit, resumeEntry } from "./entry-transition";
import { GreetContext, type GreetTexts } from "./motion";
import { Sheet } from "./lazy-sheet";
import { BellButton, NotificationPanel } from "./notifications";
import { ThemeToggle } from "./theme-toggle";
import { cx, Logo, LogoMark } from "./ui";

type Item = { href: string; label: string; icon: LucideIcon };

const DESK: Item[] = [
  { href: "/recepcao", label: "Agenda", icon: CalendarClock },
  { href: "/recepcao/trocas", label: "Trocas", icon: Repeat },
  { href: "/recepcao/renovacoes", label: "Convênios", icon: ShieldCheck },
  { href: "/recepcao/espera", label: "Espera", icon: Hourglass },
  { href: "/recepcao/pagamentos", label: "Pagamentos", icon: QrCode },
  { href: "/recepcao/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { href: "/recepcao/pacientes", label: "Pacientes", icon: Users },
  { href: "/recepcao/previsoes", label: "Previsões", icon: TrendingUp },
];

const DESK_FOR_PHYSIO = DESK.filter((d) => ["/recepcao/trocas", "/recepcao/renovacoes", "/recepcao/pagamentos"].includes(d.href));

export const NAV: Record<string, Item[]> = {
  PACIENTE: [
    { href: "/app", label: "Tratamento", icon: HeartPulse },
    { href: "/app/mobilidade", label: "Mobilidade", icon: Activity },
    { href: "/app/agendar", label: "Agendar", icon: CalendarPlus },
    { href: "/app/troca", label: "Troca", icon: Repeat },
    { href: "/app/unidades", label: "Unidades", icon: MapPin },
    { href: "/app/perfil", label: "Perfil", icon: User },
  ],
  RECEPCAO: DESK,
  FISIOTERAPEUTA: [
    { href: "/fisio", label: "Agenda", icon: CalendarClock },
    { href: "/fisio/pacientes", label: "Pacientes", icon: ClipboardList },
  ],
  ADMIN: [
    { href: "/admin", label: "Análises", icon: ChartColumn },
    { href: "/admin/usuarios", label: "Equipe", icon: Users },
    { href: "/admin/unidades", label: "Unidades", icon: Settings },
    { href: "/admin/parametros", label: "Parâmetros", icon: SlidersHorizontal },
    { href: "/admin/textos", label: "Textos", icon: Type },
    { href: "/admin/auditoria", label: "Auditoria", icon: FileClock },
    // Previsões já é uma aba de Análises
    ...DESK.filter((d) => d.href !== "/recepcao/previsoes").map((d) => ({ ...d, label: d.label === "Agenda" ? "Recepção" : d.label })),
  ],
};

/** Rodapé da sidebar, em todos os perfis: leva à página pública. Recolhida, só o ícone com tooltip. */
export function HomeLink() {
  return (
    <Link href="/" prefetch={false} aria-label="Voltar à página inicial" className="side-home nav-link row-hover relative mb-1 flex min-h-11 items-center gap-3 rounded-xl pl-4 text-sm text-nav-ink">
      <Home strokeWidth={1.5} className="size-5 shrink-0" />
      <span className="nav-label truncate">Voltar à página inicial</span>
      <span aria-hidden className="nav-tip">Voltar à página inicial</span>
    </Link>
  );
}

export async function logout() {
  // A esfera se junta (~600 ms) enquanto a sessão encerra; nenhuma espera a mais
  await Promise.all([api("/auth/logout", { body: {} }), playExit()]);
  // Aparelho compartilhado: não deixa dados de saúde no cache offline
  await window.caches?.delete("mv-data").catch(() => {});
  // Termina na página inicial com navegação completa: nada da área logada (estado do React, cache das consultas,
  // atributos de animação em <html>) sobrevive à troca, e o script inline da página pública roda de novo
  delete document.documentElement.dataset.sideAnim;
  location.replace("/");
}

const isActive = (path: string, href: string) => path === href || (href.split("/").length > 2 && path.startsWith(href));

const MOBILITY = "/app/mobilidade";
const LOCK_LABEL = "Mobilidade (liberada após a confirmação do pagamento)";

/** Cadeado sobre o ícone da Mobilidade enquanto o pagamento aguarda: o servidor também bloqueia a aba. */
const LockDot = () => <Lock aria-hidden strokeWidth={2} className="absolute -top-1 -right-1.5 size-3.5 rounded-full bg-surface p-0.5 text-warn" />;

/** Só lê o cache (enabled: false): quem busca /me/home são as telas e o pré-carregamento, sem disputar a hidratação. */
function useMobilityLocked(role: string) {
  const { data } = useQuery({ ...q.home, enabled: false, select: (d) => !!d.awaiting });
  return role === "PACIENTE" && !!data;
}

/** Um único destaque que desliza (transform) até a aba ativa, em vez de pular de um item para o outro. */
const indicator = (index: number) => ({ "--ind": Math.max(0, index) }) as CSSProperties;

const SideNav = memo(function SideNav({ items, path, locked }: { items: Item[]; path: string; locked: boolean }) {
  const active = items.findIndex((i) => isActive(path, i.href));
  return (
    <nav aria-label="Principal" className="side-nav relative flex flex-1 flex-col gap-0.5 overflow-y-auto">
      <span aria-hidden className="nav-ind" data-on={active >= 0 || undefined} style={indicator(active)} />
      {items.map((i) => (
        <Link key={i.href} href={i.href} prefetch aria-label={locked && i.href === MOBILITY ? LOCK_LABEL : i.label} aria-current={isActive(path, i.href) ? "page" : undefined}
          className={cx("nav-link relative flex min-h-11 items-center gap-3 rounded-xl border-l-[3px] border-transparent pl-[13px] text-[15px]", isActive(path, i.href) ? "font-semibold text-nav-active-ink" : "row-hover text-nav-ink")}>
          <span className="relative shrink-0"><i.icon strokeWidth={1.5} className="size-5" />{locked && i.href === MOBILITY && <LockDot />}</span>
          <span className="nav-label truncate">{i.label}</span>
          <span aria-hidden className="nav-tip">{i.label}</span>
        </Link>
      ))}
    </nav>
  );
});

// No máximo 5 itens no celular, sem rolagem lateral: o resto vai para "Mais"
const MAX_TABS = 5;
const tabClass = (on: boolean) => cx("relative mx-0.5 my-1 flex min-h-12 w-[calc(100%-4px)] flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] transition-transform active:scale-[0.98]", on ? "font-semibold text-tab-active-ink" : "text-tab-ink");

const Tabs = memo(function Tabs({ items, path, locked }: { items: Item[]; path: string; locked: boolean }) {
  // Guardar a rota: navegar fecha a folha sozinho
  const [moreAt, setMoreAt] = useState<string | null>(null);
  const overflow = items.length > MAX_TABS;
  const shown = overflow ? items.slice(0, MAX_TABS - 1) : items;
  const rest = overflow ? items.slice(MAX_TABS - 1) : [];
  const restActive = rest.some((i) => isActive(path, i.href));
  const active = restActive ? shown.length : shown.findIndex((i) => isActive(path, i.href));
  const count = shown.length + (overflow ? 1 : 0);
  return (
    <nav aria-label="Abas" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-chrome pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="relative">
      <span aria-hidden className="tab-ind" data-on={active >= 0 || undefined} style={{ ...indicator(active), width: `${100 / count}%` }} />
      <ul className="flex">
        {shown.map((i) => (
          <li key={i.href} className="min-w-0 flex-1">
            <Link href={i.href} prefetch aria-current={isActive(path, i.href) ? "page" : undefined} aria-label={locked && i.href === MOBILITY ? LOCK_LABEL : undefined} className={tabClass(isActive(path, i.href))}>
              <span className="relative"><i.icon strokeWidth={1.5} className="size-[22px]" />{locked && i.href === MOBILITY && <LockDot />}</span>
              <span className="max-w-full truncate px-0.5">{i.label}</span>
            </Link>
          </li>
        ))}
        {overflow && (
          <li className="min-w-0 flex-1">
            <button type="button" onClick={() => setMoreAt(path)} aria-haspopup="dialog" aria-expanded={moreAt === path} className={tabClass(restActive)}>
              <Ellipsis strokeWidth={1.5} className="size-[22px]" />
              <span className="max-w-full truncate px-0.5">Mais</span>
            </button>
          </li>
        )}
      </ul>
      </div>
      {overflow && (
        <Sheet open={moreAt === path} onClose={() => setMoreAt(null)} title="Mais">
          <ul className="flex flex-col gap-1">
            {[...rest, { href: "/", label: "Voltar à página inicial", icon: Home }].map((i) => (
              <li key={i.href}>
                <Link href={i.href} prefetch={i.href !== "/"} aria-current={isActive(path, i.href) ? "page" : undefined} onClick={() => setMoreAt(null)}
                  className={cx("flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px]", isActive(path, i.href) ? "bg-nav-active font-semibold text-nav-active-ink" : "row-hover text-ink")}>
                  <i.icon strokeWidth={1.5} className="size-5 shrink-0" />{i.label}
                </Link>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </nav>
  );
});

// [dados, rotas que já os buscam na própria tela]
const DESK_DATA = [[q.deskPayments, ["/recepcao/pagamentos"]], [q.deskRequests, ["/recepcao/trocas"]], [q.deskRenewals, ["/recepcao/renovacoes"]], [q.deskWaitlist, ["/recepcao/espera"]], [q.units, ["/recepcao", "/admin", "/admin/usuarios"]]] as const;
const PRELOAD: Record<string, readonly (readonly [object, readonly string[]])[]> = {
  PACIENTE: [[q.home, ["/app", "/app/mobilidade", "/app/agendar", "/app/troca"]], [q.requests, ["/app/troca"]], [q.waitlist, ["/app/troca"]], [q.lateOffers, ["/app/troca"]], [q.bookingInfo, ["/app/agendar"]], [q.profile, ["/app/perfil"]], [q.unitsOverview, ["/app/unidades"]], [q.units, ["/app/agendar", "/app/perfil"]]],
  RECEPCAO: DESK_DATA,
  ADMIN: [...DESK_DATA, [q.staff, ["/admin/usuarios"]], [q.adminUnits, ["/admin/unidades"]], [q.settings, ["/admin/parametros"]], [q.messages, ["/admin/textos"]]],
  FISIOTERAPEUTA: [[q.physioPatients(""), ["/fisio/pacientes"]]],
};

/**
 * Sem pressa: deixa no cache os dados das outras abas.
 * Pula o que a rota atual usa: a página hidrata depois do shell, e dado que chegasse antes dela quebraria a hidratação.
 */
function usePreloadData(role: string, path: string) {
  const qc = useQueryClient();
  const firstPath = useRef(path);
  useEffect(() => {
    const load = () => {
      for (const [options, usedBy] of PRELOAD[role] ?? [])
        if (!usedBy.includes(firstPath.current)) void qc.prefetchQuery(options as Parameters<typeof qc.prefetchQuery>[0]);
      if ((role === "RECEPCAO" || role === "ADMIN") && firstPath.current !== "/recepcao/pacientes") void qc.prefetchInfiniteQuery(q.deskPatients(""));
    };
    const idle = globalThis.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 300));
    idle(load);
  }, [qc, role]);
}

const SKELETON = 'main [role="status"][aria-label^="Carregando"]';

/** Entrada (login ou "Minha área"): a esfera explode quando o painel não tem mais esqueleto de carregamento. */
function useEntry() {
  useEffect(() => {
    if (!resumeEntry()) return;
    const id = setInterval(() => {
      if (!entryActive()) return clearInterval(id);
      if (document.querySelector("main")?.childElementCount && !document.querySelector(SKELETON)) {
        clearInterval(id);
        entryReady();
      }
    }, 60);
    return () => clearInterval(id);
  }, []);
}

export function AppShell({ role, name, deskless, greet = {}, children }: { role: string; name: string; deskless?: boolean; greet?: GreetTexts; children: ReactNode }) {
  const path = usePathname();
  // Unidade sem recepção: a fisioterapeuta assume as filas dos próprios pacientes
  const items = deskless ? [...NAV.FISIOTERAPEUTA, ...DESK_FOR_PHYSIO] : NAV[role];
  // Análises e assistente: só administração e recepção (o servidor confere de novo em cada rota)
  const analyst = role === "ADMIN" || role === "RECEPCAO";
  const sideBell = useRef<HTMLButtonElement>(null);
  // Guardar a rota em vez de um booleano: navegar fecha o painel e nada além do clique no sino abre
  const [notesAt, setNotesAt] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const router = useRouter();
  // Recolhida, o "M" expande; expandida, leva ao início
  const onLogo = () => (document.documentElement.dataset.sidebar === "collapsed" ? toggleSidebar() : router.push(items[0].href));
  usePreloadData(role, path);
  useEntry();
  const [greetValue] = useState(() => ({ name, texts: greet }));
  const locked = useMobilityLocked(role);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "[" && !e.metaKey && !e.ctrlKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) toggleSidebar();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const openFromSidebar = () => {
    setAnchor(sideBell.current?.getBoundingClientRect() ?? null);
    setNotesAt(path);
  };
  const openFromHeader = () => {
    setAnchor(null);
    setNotesAt(path);
  };

  return (
    <GreetContext value={greetValue}>
    <div className="min-h-dvh">
      <aside className="side-panel border-r border-line-strong bg-sidebar">
        <div className="side-inner">
          <div className="mb-5 flex min-h-11 items-center">
            <button type="button" onClick={onLogo} aria-label="Movimento: início ou expandir menu" className="flex min-h-11 items-center rounded-xl pl-3.5">
              <span data-logo-mark className="inline-block"><LogoMark className="size-8" /></span>
              <span aria-hidden className="nav-label font-display text-2xl leading-none text-ink">ovimento</span>
            </button>
          </div>
          <button type="button" onClick={toggleSidebar} aria-label="Recolher ou expandir menu (atalho: [)" title="Recolher ou expandir menu ( [ )" className="side-toggle flex size-11 items-center justify-center rounded-full bg-accent-soft text-ink">
            <PanelLeftClose strokeWidth={1.5} className="collapse-icon size-5" />
          </button>
          <SideNav items={items} path={path} locked={locked} />
          <div className="pt-3">
            <div className="side-divider border-t border-line pb-2" />
            <HomeLink />
            <p className="nav-label truncate px-4 pb-1 text-sm text-ink-2">{name}</p>
            <div className="side-foot flex pl-1">
              <BellButton onOpen={openFromSidebar} buttonRef={sideBell} />
              <ThemeToggle reveal />
              <button type="button" onClick={logout} aria-label="Sair" className="flex size-11 items-center justify-center rounded-full text-ink-2"><LogOut strokeWidth={1.5} className="size-5" /></button>
            </div>
          </div>
        </div>
      </aside>

      <div data-side-content className="side-content min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface pr-2 pl-4 lg:hidden" style={{ paddingTop: "env(safe-area-inset-top)", boxSizing: "content-box" }}>
          <Link href={items[0].href} aria-label="Início"><Logo size={22} /></Link>
          <div className="flex items-center">
            <Link href="/" prefetch={false} aria-label="Voltar à página inicial" title="Voltar à página inicial" className="flex size-11 items-center justify-center rounded-full text-ink-2"><Home strokeWidth={1.5} className="size-5" /></Link>
            <ThemeToggle reveal />
            <BellButton onOpen={openFromHeader} />
            {role !== "PACIENTE" && (
              <button type="button" onClick={logout} aria-label="Sair" className="flex size-11 items-center justify-center rounded-full text-ink-2"><LogOut strokeWidth={1.5} className="size-5" /></button>
            )}
          </div>
        </header>
        <main className={cx("mx-auto w-full max-w-[1760px] px-4 pt-6 sm:px-6 lg:px-8 lg:pt-8", analyst ? "pb-[calc(148px+env(safe-area-inset-bottom))] lg:pb-24" : "pb-[calc(96px+env(safe-area-inset-bottom))] lg:pb-10")}>
          {/* Troca de rota: a tela sai em fade curto e a nova entra com leve deslocamento (View Transitions; sem suporte, troca direto) */}
          <ViewTransition key={path} enter="page-in" exit="page-out" default="none">{children}</ViewTransition>
        </main>
      </div>

      <Tabs items={items} path={path} locked={locked} />
      {analyst && <AssistantButton />}
      <NotificationPanel open={notesAt === path} anchor={anchor} onClose={() => setNotesAt(null)} />
    </div>
    </GreetContext>
  );
}
