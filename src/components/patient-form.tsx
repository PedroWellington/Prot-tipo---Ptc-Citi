"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { q } from "@/lib/queries";
import { CPF_AJUDA, CPF_INCOMPLETO, formatCpfInput, hasCpfFormat } from "@/lib/cpf";
import { BairroInput } from "./bairro-input";
import { Button, Input, Segmented, Select } from "./ui";

export type Unit = { id: string; code: string; name: string; physios: { id: string; name: string }[] };
export const useUnits = () => useQuery(q.units);

/** Mesmo formulário no autocadastro e no cadastro pela recepção. */
export function PatientForm({ submitLabel, consentLabel, cpfHint, emailNote, onSubmit }: {
  submitLabel: string;
  cpfHint?: string;
  /** Aviso sempre visível sob o e-mail (autocadastro: o código de confirmação vai para ele). */
  emailNote?: ReactNode;
  consentLabel: string;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
}) {
  const { data: units } = useUnits();
  const [type, setType] = useState<"PARTICULAR" | "CONVENIO">("PARTICULAR");
  const [cpf, setCpf] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget));
    // Mesma regra da API: só o formato (11 números); qualquer número serve neste protótipo
    if (!hasCpfFormat(String(fd.cpf ?? ""))) { setErrors({ cpf: CPF_INCOMPLETO }); setGeneral(""); return; }
    setBusy(true); setErrors({}); setGeneral("");
    try {
      await onSubmit({ ...fd, type, consent: fd.consent === "on", whatsappOptIn: fd.whatsappOptIn === "on", preferredUnitId: fd.preferredUnitId || undefined });
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      setGeneral(err instanceof Error ? err.message : "Não foi possível continuar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Input label="CPF" name="cpf" inputMode="numeric" value={cpf} onChange={(e) => setCpf(formatCpfInput(e.target.value))} placeholder="000.000.000-00" hint={cpfHint ?? CPF_AJUDA} error={errors.cpf} required />
      <Input label="E-mail" name="email" type="email" inputMode="email" autoComplete="email" hint={emailNote ? undefined : "É por aqui que enviamos seus avisos."} note={emailNote} error={errors.email} required />
      <Input label="Nome completo" name="name" autoComplete="name" error={errors.name} required />
      <Input label="Telefone / WhatsApp" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(81) 90000-0000" error={errors.phone} required />
      <Segmented label="Tipo de atendimento" value={type} onChange={setType} options={[{ value: "PARTICULAR", label: "Particular" }, { value: "CONVENIO", label: "Convênio" }]} />
      {type === "CONVENIO" && (
        <div className="page-enter flex flex-col gap-4">
          <Input label="Nome do convênio" name="insurer" error={errors.insurer} />
          <Input label="Número da carteirinha" name="cardNumber" error={errors.cardNumber} />
        </div>
      )}
      <BairroInput name="bairro" error={errors.bairro} hint="Ajuda a mostrar a unidade mais perto de você." />
      <Select label="Unidade preferida" name="preferredUnitId" defaultValue="">
        <option value="">Sem preferência</option>
        {units?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </Select>
      <Input label="Segundo contato: nome" name="secondContactName" hint="Opcional, mas ajuda se não conseguirmos falar com você." />
      <Input label="Segundo contato: telefone" name="secondContactPhone" type="tel" inputMode="tel" error={errors.secondContactPhone} />
      <label className="flex items-start gap-3 text-sm text-ink-2">
        <input type="checkbox" name="consent" className="mt-0.5 size-5 accent-[var(--accent)]" />
        <span>{consentLabel}</span>
      </label>
      <label className="flex items-start gap-3 text-sm text-ink-2">
        <input type="checkbox" name="whatsappOptIn" className="mt-0.5 size-5 accent-[var(--accent)]" />
        <span>Aceito receber avisos das sessões pelo WhatsApp. Opcional: dá para mudar depois no perfil. Sem isso, os avisos chegam por e-mail e no app.</span>
      </label>
      {errors.consent && <p className="text-sm text-danger">{errors.consent}</p>}
      {general && <p role="alert" className="text-sm text-danger">{general}</p>}
      <Button type="submit" variant="brand" loading={busy} className="w-full">{busy ? "Enviando…" : submitLabel}</Button>
    </form>
  );
}
