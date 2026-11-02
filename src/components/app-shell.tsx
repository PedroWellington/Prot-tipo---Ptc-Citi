"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CalendarPlus, ClipboardList, FileClock, HeartPulse, Hourglass, LayoutDashboard, LogOut, MapPin, MessageCircle, PanelLeftClose, QrCode, Repeat, Settings, ShieldCheck, SlidersHorizontal, Type, User, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { q } from "@/lib/queries";
import { toggleSidebar } from "@/lib/theme";
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
];

const DESK_FOR_PHYSIO = DESK.filter((d) => ["/recepcao/trocas", "/recepcao/renovacoes", "/recepcao/pagamentos"].includes(d.href));

export const NAV: Record<string, Item[]> = {
  PACIENTE: [
    { href: "/app", label: "Tratamento", icon: HeartPulse },
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
    { href: "/admin", label: "Métricas", icon: LayoutDashboard },
    { href: "/admin/usuarios", label: "Equipe", icon: Users },
    { href: "/admin/unidades", label: "Unidades", icon: Settings },
    { href: "/admin/parametros", label: "Parâmetros", icon: SlidersHorizontal },
    { href: "/admin/textos", label: "Textos", icon: Type },
    { href: "/admin/auditoria", label: "Auditoria", icon: FileClock },
    ...DESK.map((d) => ({ ...d, label: d.label === "Agenda" ? "Recepção" : d.label })),
  ],
};

export async function logout() {
  await api("/auth/logout", { body: {} });
  // Aparelho compartilhado: não deixa dados de saúde no cache offline
  await window.caches?.delete("mv-data").catch(() => {});
  location.href = "/login";
}

const isActive = (path: string, href: string) => path === href || (href.split("/").length > 2 && path.startsWith(href));

const SideNav = memo(function SideNav({ items, path }: { items: Item[]; path: string }) {
  return (
    <nav aria-label="Principal" className="side-nav flex flex-1 flex-col gap-0.5 overflow-y-auto">
      {items.map((i) => (
        <Link key={i.href} href={i.href} prefetch aria-label={i.label} aria-current={isActive(path, i.href) ? "page" : undefined}
          className={cx("nav-link relative flex min-h-11 items-center gap-3 rounded-xl border-l-[3px] pl-[13px] text-[15px]", isActive(path, i.href) ? "border-accent bg-nav-active font-semibold text-nav-active-ink" : "row-hover border-transparent text-ink-2")}>
          <i.icon strokeWidth={1.5} className="size-5 shrink-0" />
          <span className="nav-label truncate">{i.label}</span>
          <span aria-hidden className="nav-tip">{i.label}</span>
        </Link>
      ))}
    </nav>
  );
});

const Tabs = memo(function Tabs({ items, path }: { items: Item[]; path: string }) {
  return (
    <nav aria-label="Abas" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="flex overflow-x-auto overscroll-contain [scrollbar-width:none]">
        {items.map((i) => (
          <li key={i.href} className={cx("min-w-0 flex-1", items.length > 5 && "min-w-[72px] shrink-0")}>
            <Link href={i.href} prefetch aria-current={isActive(path, i.href) ? "page" : undefined}
              className={cx("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]", isActive(path, i.href) ? "font-semibold text-accent" : "text-ink-3")}>
              <i.icon strokeWidth={1.5} className="size-[22px]" />
              <span className="max-w-full truncate px-0.5">{i.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
});

// [dados, rotas que já os buscam na própria tela]
const DESK_DATA = [[q.deskPayments, ["/recepcao/pagamentos"]], [q.deskRequests, ["/recepcao/trocas"]], [q.deskRenewals, ["/recepcao/renovacoes"]], [q.deskWaitlist, ["/recepcao/espera"]], [q.units, ["/recepcao", "/admin", "/admin/usuarios"]]] as const;
const PRELOAD: Record<string, readonly (readonly [object, readonly string[]])[]> = {
  PACIENTE: [[q.home, ["/app", "/app/agendar", "/app/troca"]], [q.requests, ["/app/troca"]], [q.waitlist, ["/app/troca"]], [q.lateOffers, ["/app/troca"]], [q.bookingInfo, ["/app/agendar"]], [q.profile, ["/app/perfil"]], [q.unitsOverview, ["/app/unidades"]], [q.units, ["/app/agendar", "/app/perfil"]]],
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

export function AppShell({ role, name, deskless, children }: { role: string; name: string; deskless?: boolean; children: ReactNode }) {
  const path = usePathname();
  // Unidade sem recepção: a fisioterapeuta assume as filas dos próprios pacientes
  const items = deskless ? [...NAV.FISIOTERAPEUTA, ...DESK_FOR_PHYSIO] : NAV[role];
  const sideBell = useRef<HTMLButtonElement>(null);
  // Guardar a rota em vez de um booleano: navegar fecha o painel e nada além do clique no sino abre
  const [notesAt, setNotesAt] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const router = useRouter();
  // Recolhida, o "M" expande; expandida, leva ao início
  const onLogo = () => (document.documentElement.dataset.sidebar === "collapsed" ? toggleSidebar() : router.push(items[0].href));
  usePreloadData(role, path);

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
    <div className="min-h-dvh">
      <aside className="side-panel border-r border-line-strong bg-sidebar">
        <div className="side-inner">
          <div className="mb-5 flex min-h-11 items-center">
            <button type="button" onClick={onLogo} aria-label="Movimento: início ou expandir menu" className="flex min-h-11 items-center rounded-xl pl-3.5">
              <span data-logo-mark className="inline-block"><LogoMark className="h-8 w-6" /></span>
              <span aria-hidden className="nav-label font-display text-2xl leading-none text-ink">ovimento</span>
            </button>
          </div>
          <button type="button" onClick={toggleSidebar} aria-label="Recolher ou expandir menu (atalho: [)" title="Recolher ou expandir menu ( [ )" className="side-toggle flex size-11 items-center justify-center rounded-full bg-accent-soft text-ink">
            <PanelLeftClose strokeWidth={1.5} className="collapse-icon size-5" />
          </button>
          <SideNav items={items} path={path} />
          <div className="pt-3">
            <div className="side-divider border-t border-line pb-2" />
            <p className="nav-label truncate px-4 pb-1 text-sm text-ink-2">{name}</p>
            <div className="side-foot flex pl-1">
              <BellButton onOpen={openFromSidebar} buttonRef={sideBell} />
              <ThemeToggle />
              <button type="button" onClick={logout} aria-label="Sair" className="flex size-11 items-center justify-center rounded-full text-ink-2"><LogOut strokeWidth={1.5} className="size-5" /></button>
            </div>
          </div>
        </div>
      </aside>

      <div data-side-content className="side-content min-w-0">
        <header className="sticky top-[var(--banner-h)] z-30 flex h-14 items-center justify-between border-b border-line bg-surface pr-2 pl-4 lg:hidden" style={{ paddingTop: "env(safe-area-inset-top)", boxSizing: "content-box" }}>
          <Link href={items[0].href} aria-label="Início"><Logo size={22} /></Link>
          <div className="flex items-center">
            <ThemeToggle />
            <BellButton onOpen={openFromHeader} />
            {role !== "PACIENTE" && (
              <button type="button" onClick={logout} aria-label="Sair" className="flex size-11 items-center justify-center rounded-full text-ink-2"><LogOut strokeWidth={1.5} className="size-5" /></button>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1760px] px-4 pt-6 pb-[calc(96px+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:pt-8 lg:pb-10">{children}</main>
      </div>

      <Tabs items={items} path={path} />
      <NotificationPanel open={notesAt === path} anchor={anchor} onClose={() => setNotesAt(null)} />
    </div>
  );
}
