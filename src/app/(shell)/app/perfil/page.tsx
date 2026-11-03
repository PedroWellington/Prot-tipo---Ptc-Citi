"use client";

import { useQuery } from "@tanstack/react-query";
import { Bell, CreditCard, Info, Download, IdCard, KeyRound, LogOut, MapPin, MessageCircle, Moon, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { logout } from "@/components/app-shell";
import { toggleTheme } from "@/lib/theme";
import { Sheet } from "@/components/lazy-sheet";
import { useUnits } from "@/components/patient-form";
import { BairroInput } from "@/components/bairro-input";
import { useAction } from "@/components/providers";
import { Badge, Button, Card, ErrorState, Input, ListSkeleton, PageTitle, Select, Tile, Toggle } from "@/components/ui";
import Link from "next/link";
import { api } from "@/lib/api";
import { q } from "@/lib/queries";
import { formatPhone } from "@/lib/labels";
import type { profile } from "@/server/services/patients";

type Profile = Awaited<ReturnType<typeof profile>>;

export default function Page() {
  const { data: p, isLoading, error, refetch } = useQuery(q.profile);
  const { data: units } = useUnits();
  const { data: payments } = useQuery(q.payments);
  const [sheet, setSheet] = useState<"senha" | "excluir" | null>(null);

  const save = useAction({
    run: (body: Record<string, unknown>) => api("/me/profile", { method: "PATCH", body }),
    optimistic: { key: ["profile"], update: (old: Profile, v: Record<string, unknown>) => ({ ...old, ...v }) },
  });
  const form = useAction({
    run: (body: Record<string, unknown>) => api("/me/profile", { method: "PATCH", body }),
    invalidate: [["profile"]], success: "Dados atualizados",
  });
  const password = useAction({
    run: (body: Record<string, unknown>) => api("/auth/password", { body }), success: "Senha alterada", onDone: () => setSheet(null),
  });
  const remove = useAction({
    run: (body: Record<string, unknown>) => api("/me/delete", { body }), onDone: () => window.location.assign("/login"),
  });

  const submit = (fn: (b: Record<string, unknown>) => void) => (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    fn(Object.fromEntries(new FormData(e.currentTarget)));
  };

  if (isLoading) return <ListSkeleton />;
  if (error || !p) return <ErrorState error={error} retry={refetch} />;

  return (
    <>
      <PageTitle eyebrow={p.user.email} title={p.user.name} />
      <ul className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          [<IdCard key="i" />, "accent", "Atendimento", p.type === "CONVENIO" ? p.insurer ?? "Convênio" : "Particular"],
          [<MapPin key="i" />, "warn", "Unidade preferida", units?.find((u) => u.id === p.preferredUnitId)?.name ?? "Sem preferência"],
          [<UsersRound key="i" />, "info", "Segundo contato", p.secondContactName ?? "Não informado"],
          [<MessageCircle key="i" />, p.whatsappOptIn ? "ok" : "neutral", "WhatsApp", p.whatsappOptIn ? "Avisos ativos" : "Desativado"],
        ] as const).map(([icon, tone, label, value]) => (
          <li key={label} className="card flex items-center gap-3 p-4">
            <Tile tone={tone}>{icon}</Tile>
            <span className="min-w-0"><span className="block text-xs text-ink-3">{label}</span><span className="block truncate text-sm font-semibold">{value}</span></span>
          </li>
        ))}
      </ul>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 flex items-center gap-3 font-semibold"><Tile tone="accent"><IdCard /></Tile>Dados pessoais</h2>
          <form key={p.user.name} onSubmit={submit((b) => form.mutate({ ...b, preferredUnitId: b.preferredUnitId || null, bairro: b.bairro || null }))} className="flex flex-col gap-3">
            <Input label="Nome" name="name" defaultValue={p.user.name} required />
            <Input label="CPF" value={p.cpf} readOnly disabled hint="Para alterar, fale com a recepção." />
            <Input label="Telefone" name="phone" type="tel" defaultValue={formatPhone(p.phone)} required />
            <Input label="Segundo contato: nome" name="secondContactName" defaultValue={p.secondContactName ?? ""} />
            <Input label="Segundo contato: telefone" name="secondContactPhone" type="tel" defaultValue={p.secondContactPhone ? formatPhone(p.secondContactPhone) : ""} />
            <BairroInput name="bairro" defaultValue={p.bairro ?? ""} />
            <Select label="Unidade preferida" name="preferredUnitId" defaultValue={p.preferredUnitId ?? ""}>
              <option value="">Sem preferência</option>
              {units?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
            <Button type="submit" variant="primary" loading={form.isPending}>Salvar</Button>
          </form>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="mb-2 flex items-center gap-3 font-semibold"><Tile tone="info"><Bell /></Tile>Notificações</h2>
            <Toggle label="Avisos por e-mail" hint="Lembretes, trocas e convênio" checked={p.notifyEmail} onChange={(v) => save.mutate({ notifyEmail: v })} />
            <Toggle label="Mensagens educativas" hint="Dicas a cada sessão concluída" checked={p.notifyEducational} onChange={(v) => save.mutate({ notifyEducational: v })} />
            <Toggle label="Avisos pelo WhatsApp" hint="Revogue quando quiser. Sem isso, usamos e-mail e o app." checked={p.whatsappOptIn} onChange={(v) => save.mutate({ whatsappOptIn: v })} />
          </Card>
          {!!payments?.length && (
            <Card>
              <h2 className="mb-2 flex items-center gap-3 font-semibold"><Tile tone="ok"><CreditCard /></Tile>Pagamentos</h2>
              <ul className="divide-y divide-line">
                {payments.map((x) => (
                  <li key={x.id}>
                    <Link href={`/app/pagamento/${x.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2">
                      <span className="text-sm">{x.sessionCount} {x.sessionCount === 1 ? "sessão" : "sessões"} · {(x.amountCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                      <Badge tone={x.status === "PAGO" ? "ok" : "warn"}>{x.status === "PAGO" ? "Pago" : "Aguardando"}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card className="flex flex-col gap-2">
            <h2 className="mb-1 flex items-center gap-3 font-semibold"><Tile tone="danger"><ShieldCheck /></Tile>Conta e privacidade</h2>
            <Button variant="ghost" className="justify-start" onClick={() => setSheet("senha")}><KeyRound strokeWidth={1.5} className="size-4" />Trocar senha</Button>
            <Button variant="ghost" className="justify-start" onClick={toggleTheme}><Moon strokeWidth={1.5} className="size-4" />Alternar tema</Button>
            <Button variant="ghost" className="justify-start" onClick={() => window.location.assign("/api/me/export")}><Download strokeWidth={1.5} className="size-4" />Baixar meus dados</Button>
            <Link href="/" prefetch={false} className="btn btn-ghost justify-start"><Info strokeWidth={1.5} className="size-4" />Sobre a clínica</Link>
            <Button variant="ghost" className="justify-start" onClick={logout}><LogOut strokeWidth={1.5} className="size-4" />Sair</Button>
            <Button variant="danger" className="justify-start" onClick={() => setSheet("excluir")}><Trash2 strokeWidth={1.5} className="size-4" />Excluir conta</Button>
          </Card>
        </div>
      </div>

      <Sheet open={sheet === "senha"} onClose={() => setSheet(null)} title="Trocar senha">
        <form onSubmit={submit((b) => password.mutate(b))} className="flex flex-col gap-4">
          <Input label="Senha atual" name="current" type="password" autoComplete="current-password" required />
          <Input label="Nova senha" name="next" type="password" autoComplete="new-password" hint="Pelo menos 8 caracteres, com letras e números." required />
          <Button type="submit" loading={password.isPending}>Salvar nova senha</Button>
        </form>
      </Sheet>
      <Sheet open={sheet === "excluir"} onClose={() => setSheet(null)} title="Excluir conta">
        <form onSubmit={submit((b) => remove.mutate(b))} className="flex flex-col gap-4">
          <p className="text-ink-2">Suas sessões futuras serão canceladas e seus dados pessoais, apagados. O histórico clínico fica anonimizado. Essa ação não pode ser desfeita.</p>
          <Input label="Confirme sua senha" name="password" type="password" autoComplete="current-password" required />
          <Button type="submit" variant="danger" loading={remove.isPending}>Excluir definitivamente</Button>
        </form>
      </Sheet>
    </>
  );
}
