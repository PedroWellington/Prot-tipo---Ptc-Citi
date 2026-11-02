"use client";

import { useQuery } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useState } from "react";
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
  const create = useAction({
    run: (body: Record<string, FormDataEntryValue>) => api("/admin/users", { body }),
    invalidate: [KEY, ["units"]], success: "Usuário criado. A troca de senha será exigida no 1º acesso.", onDone: () => setAdding(false),
  });
  const disable = useAction({
    run: (id: string) => api(`/admin/users/${id}`, { method: "DELETE" }),
    optimistic: { key: KEY, update: (old: Row[], id: string) => old.filter((u) => u.id !== id) }, invalidate: [["units"]],
  });

  return (
    <>
      <PageTitle eyebrow="Administração" title="Equipe" action={<Button onClick={() => setAdding(true)}><UserPlus strokeWidth={1.5} className="size-4" />Novo</Button>} />
      {isLoading && <ListSkeleton />}
      {error && <ErrorState error={error} retry={refetch} />}
      {!!data?.length && (
        <ul className="card grid overflow-hidden lg:grid-cols-2">
          {data.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 border-b border-line p-4">
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate font-medium">{u.name}</p>
                <p className="truncate text-sm text-ink-3">{u.email}{u.unit && ` · ${u.unit.name}`}</p>
              </div>
              <Badge>{ROLE_LABEL[u.role]}</Badge>
              {u.role !== "ADMIN" && <Button variant="line" onClick={() => disable.mutate(u.id)}>Desativar</Button>}
            </li>
          ))}
        </ul>
      )}
      <Sheet open={adding} onClose={() => setAdding(false)} title="Novo usuário">
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); create.mutate(Object.fromEntries(new FormData(e.currentTarget))); }}>
          <Input label="Nome" name="name" required />
          <Input label="E-mail" name="email" type="email" required />
          <Select label="Perfil" name="role" defaultValue="RECEPCAO">
            <option value="RECEPCAO">Recepção</option><option value="FISIOTERAPEUTA">Fisioterapeuta</option><option value="ADMIN">Administrador</option>
          </Select>
          <Select label="Unidade" name="unitId">{units?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
          <Input label="CREFITO (fisioterapeuta)" name="crefito" />
          <Input label="Senha inicial" name="password" type="password" autoComplete="new-password" required hint="A pessoa troca no primeiro acesso." />
          <Button type="submit" loading={create.isPending}>Criar usuário</Button>
        </form>
      </Sheet>
    </>
  );
}
