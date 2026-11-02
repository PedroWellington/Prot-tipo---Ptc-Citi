"use client";

import { useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useAction } from "@/components/providers";
import { Button, Card, ErrorState, Input, ListSkeleton, PageTitle, Select, Toggle } from "@/components/ui";
import { api } from "@/lib/api";
import { q } from "@/lib/queries";
import type { listHolidays, listUnits } from "@/server/repositories/config";

type Unit = Awaited<ReturnType<typeof listUnits>>[number];
type Holiday = Awaited<ReturnType<typeof listHolidays>>[number];

function UnitForm({ u }: { u: Unit }) {
  const save = useAction({
    run: (body: Record<string, unknown>) => api(`/admin/units/${u.id}`, { method: "PATCH", body }),
    invalidate: [["admin-units"], ["units"]], success: `${u.name} atualizada`,
  });
  const optimisticSat = useAction({
    run: (saturdayEnabled: boolean) => api(`/admin/units/${u.id}`, { method: "PATCH", body: { saturdayEnabled } }),
    optimistic: { key: ["admin-units"], update: (old: Unit[], v: boolean) => old.map((x) => (x.id === u.id ? { ...x, saturdayEnabled: v } : x)) },
  });
  return (
    <Card>
      <h2 className="mb-3 font-display text-2xl">{u.name}</h2>
      <form className="flex flex-col gap-3" onSubmit={(e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
        save.mutate({
          address: f.address, phone: f.phone, chairs: Number(f.chairs), openHour: Number(f.openHour), closeHour: Number(f.closeHour),
          satOpenHour: Number(f.satOpenHour), satCloseHour: Number(f.satCloseHour), lat: Number(f.lat), lng: Number(f.lng),
          lateToleranceMin: Number(f.lateToleranceMin), slotHoldMin: Number(f.slotHoldMin),
        });
      }}>
        <Input label="Endereço" name="address" defaultValue={u.address} required />
        <Input label="Telefone" name="phone" defaultValue={u.phone} required />
        <div className="grid grid-cols-3 gap-3">
          <Input label="Cadeiras" name="chairs" type="number" min={1} defaultValue={u.chairs} />
          <Input label="Abre" name="openHour" type="number" defaultValue={u.openHour} />
          <Input label="Fecha" name="closeHour" type="number" defaultValue={u.closeHour} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Tolerância de atraso (min)" name="lateToleranceMin" type="number" min={0} defaultValue={u.lateToleranceMin} />
          <Input label="Espera da vaga (min)" name="slotHoldMin" type="number" min={1} defaultValue={u.slotHoldMin} />
        </div>
        <Toggle label="Atender aos sábados" checked={u.saturdayEnabled} onChange={(v) => optimisticSat.mutate(v)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Sábado abre" name="satOpenHour" type="number" defaultValue={u.satOpenHour} />
          <Input label="Sábado fecha" name="satCloseHour" type="number" defaultValue={u.satCloseHour} />
          <Input label="Latitude" name="lat" type="number" step="any" defaultValue={u.lat} />
          <Input label="Longitude" name="lng" type="number" step="any" defaultValue={u.lng} />
        </div>
        <Button type="submit" loading={save.isPending}>Salvar</Button>
      </form>
    </Card>
  );
}

export default function Page() {
  const units = useQuery(q.adminUnits);
  const holidays = useQuery({ queryKey: ["holidays"], queryFn: () => api<Holiday[]>("/admin/holidays") });
  const add = useAction({
    run: (body: Record<string, FormDataEntryValue>) => api("/admin/holidays", { body: { ...body, unitId: body.unitId || undefined } }),
    invalidate: [["holidays"]], success: "Feriado cadastrado",
  });
  const del = useAction({
    run: (id: string) => api(`/admin/holidays/${id}`, { method: "DELETE" }),
    optimistic: { key: ["holidays"], update: (old: Holiday[], id: string) => old.filter((h) => h.id !== id) },
  });

  return (
    <>
      <PageTitle eyebrow="Administração" title="Unidades e feriados" />
      {units.isLoading && <ListSkeleton rows={2} />}
      {units.error && <ErrorState error={units.error} retry={units.refetch} />}
      <div className="grid gap-4 lg:grid-cols-2">
        {units.data?.map((u) => <UnitForm key={u.id} u={u} />)}
      </div>
      <Card className="mt-4">
        <h2 className="mb-3 font-semibold">Feriados</h2>
        <ul className="divide-y divide-line">
          {holidays.data?.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 py-2">
              <span>{new Date(h.date).toLocaleDateString("pt-BR", { timeZone: "UTC" })} · {h.name}{h.unit && ` (${h.unit.name})`}</span>
              <button type="button" aria-label={`Remover ${h.name}`} onClick={() => del.mutate(h.id)} className="flex size-11 items-center justify-center text-ink-3"><Trash2 strokeWidth={1.5} className="size-4" /></button>
            </li>
          ))}
        </ul>
        <form className="mt-3 grid gap-3 sm:grid-cols-[160px_1fr_160px_auto] sm:items-end" onSubmit={(e) => {
          e.preventDefault();
          add.mutate(Object.fromEntries(new FormData(e.currentTarget)));
          e.currentTarget.reset();
        }}>
          <Input label="Data" name="date" type="date" required />
          <Input label="Nome" name="name" required />
          <Select label="Unidade" name="unitId"><option value="">Todas</option>{units.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
          <Button type="submit">Adicionar</Button>
        </form>
      </Card>
    </>
  );
}
