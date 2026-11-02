"use client";

import type { ReactNode } from "react";
import { SESSION_STATUS } from "@/lib/labels";
import { fmtTime } from "@/lib/time";
import type { listAgenda } from "@/server/repositories/sessions";
import { Badge } from "./ui";

export type AgendaItem = Awaited<ReturnType<typeof listAgenda>>[number];

export const isOpen = (s: AgendaItem) => s.status === "AGENDADA" || s.status === "CONFIRMADA";

export function AgendaRow({ s, subtitle, children }: { s: AgendaItem; subtitle: ReactNode; children?: ReactNode }) {
  const st = SESSION_STATUS[s.status];
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
      <span className="w-14 font-display text-2xl tabular-nums">{fmtTime(s.startsAt)}</span>
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate font-medium">{s.patient.user.name}</p>
        <p className="truncate text-sm text-ink-3">{subtitle}</p>
      </div>
      <Badge tone={st.tone}>{st.label}</Badge>
      {children && <div className="flex w-full gap-2 sm:w-auto">{children}</div>}
    </li>
  );
}
