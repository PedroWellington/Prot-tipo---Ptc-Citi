"use client";

import { useQuery } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Sheet } from "@/components/lazy-sheet";
import { useUnits } from "@/components/patient-form";
import { useAction } from "@/components/providers";
import { Badge, Button, ErrorState, Input, ListSkeleton, PageTitle, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { q } from "@/lib/queries";
import { ROLE_LABEL } from "@/lib/labels";
import type { listStaff } from "@/server/repositories/users";

type Row = Awaited<ReturnType<typeof listStaff>>[number];
const KEY = ["staff"];

export default function Page() {
  const { data, isLoading, error, refetch } = useQuery(q.staff);
  const { data: units } = useUnits();
  const [adding, setAdding] = useState(false);
  const [role, setRole] = useState("RECEPCAO");
  const create = useAction({
    run: (body: Record<string, FormDataEntryValue>) => api<{ inviteSent: boolean }>("/admin/users", { body }),
    invalidate: [KEY, ["units"]],
    onDone: (r) => {
      setAdding(false);
      if (r.inviteSent) toast.success("Convite enviado por e-mail.");
      else toast.error("Usuário criado, mas o e-mail do convite falhou. Peça para usar \"Esqueci minha senha\".");
    },
  });
  const disable = useAction({
    run: (id: string) => api(`/admin/users/${id}`, { method: "DELETE" }),
    optimistic: { key: KEY, update: (old: Row[], id: string) => old.map((u) => (u.id === id ? { ...u, deletedAt: new Date() } : u)) }, invalidate: [["units"]],
  });
  const reactivate = useAction({
    run: (id: string) => api(`/admin/users/${id}/reactivate`, { body: {} }),
    optimistic: { key: KEY, update: (old: Row[], id: string) => old.map((u) => (u.id === id ? { ...u, deletedAt: null } : u)) }, invalidate: [["units"]],
  });

  return (
    <>
      <PageTitle eyebrow="Administração" title="Equipe" action={<Button onClick={() => setAdding(true)}><UserPlus strokeWidth={1.5} className="size-4" />Novo</Button>} />
      {isLoading && <ListSkeleton />}
      {error && <ErrorState error={error} retry={refetch} />}
      {!!data?.length && (
        <ul className="card grid overflow-hidden lg:grid-cols-2">
          {data.map((u) => (
            <li key={u.id} className={`flex flex-wrap items-center gap-3 border-b border-line p-4 ${u.deletedAt ? "opacity-60" : ""}`}>
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate font-medium">{u.name}</p>
                <p className="truncate text-sm text-ink-3">{u.email}{u.unit && ` · ${u.unit.name}`}</p>
              </div>
              <Badge>{ROLE_LABEL[u.role]}</Badge>
              {u.deletedAt && <Badge tone="warn">Inativo</Badge>}
              {u.role !== "ADMIN" && (u.deletedAt
                ? <Button variant="ghost" onClick={() => reactivate.mutate(u.id)}>Reativar</Button>
                : <Button variant="line" onClick={() => disable.mutate(u.id)}>Desativar</Button>)}
            </li>
          ))}
        </ul>
      )}
      <Sheet open={adding} onClose={() => setAdding(false)} title="Novo usuário">
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); create.mutate(Object.fromEntries(new FormData(e.currentTarget))); }}>
          <Input label="Nome" name="name" required />
          <Input label="E-mail" name="email" type="email" required />
          <Select label="Perfil" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="RECEPCAO">Recepção</option><option value="FISIOTERAPEUTA">Fisioterapeuta</option>
          </Select>
          <Select label="Unidade" name="unitId">{units?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
          {role === "FISIOTERAPEUTA" && <Input label="CREFITO" name="crefito" />}
          <p className="text-sm text-ink-2">A pessoa recebe um e-mail de convite para criar a própria senha.</p>
          <Button type="submit" loading={create.isPending}>Enviar convite</Button>
        </form>
      </Sheet>
    </>
  );
}
