"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { PatientForm } from "@/components/patient-form";
import { Button, Input } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

const CONSENT = "Autorizo a Clínica Movimento a tratar meus dados pessoais e de saúde para o meu atendimento, conforme a LGPD. Posso baixar ou excluir meus dados a qualquer momento no meu perfil.";

export default function CadastroPage() {
  const [step, setStep] = useState<"dados" | "codigo" | "senha">("dados");
  const [id, setId] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<{ field?: string; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = (fn: (f: Record<string, FormDataEntryValue>) => Promise<void>) => async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await fn(Object.fromEntries(new FormData(e.currentTarget)));
    } catch (err) {
      const f = err instanceof ApiError ? err.fields : undefined;
      setError({ msg: f ? Object.values(f)[0] : (err as Error).message });
    }
    setBusy(false);
  };

  if (step === "dados")
    return (
      <AuthFrame title="Vamos começar" subtitle="Só precisamos do seu CPF e e-mail, e de alguns dados para cuidar bem de você.">
        <PatientForm submitLabel="Continuar" consentLabel={CONSENT} onSubmit={async (data) => {
          const r = await api<{ verificationId: string }>("/auth/register/start", { body: data });
          setId(r.verificationId); setEmail(String(data.email)); setStep("codigo");
        }} />
        <p className="mt-6 text-center text-sm text-ink-2">Já tem conta? <Link href="/login" className="font-semibold text-accent">Entrar</Link></p>
      </AuthFrame>
    );

  if (step === "codigo")
    return (
      <AuthFrame title="Confira seu e-mail" subtitle={`Enviamos um código de 6 dígitos para ${email}. Ele vale por 15 minutos.`}>
        <form className="flex flex-col gap-4" onSubmit={run(async (f) => {
          await api("/auth/register/verify", { body: { id, code: f.code } });
          setStep("senha");
        })}>
          <Input label="Código" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" required error={error?.msg} className="field text-center text-2xl tracking-[.4em]" />
          <Button type="submit" variant="brand" loading={busy} className="w-full">Verificar</Button>
        </form>
      </AuthFrame>
    );

  return (
    <AuthFrame title="Crie sua senha" subtitle="Tudo certo com seu e-mail. Falta só a senha de acesso.">
      <form className="flex flex-col gap-4" onSubmit={run(async (f) => {
        const r = await api<{ redirect: string }>("/auth/register/complete", { body: { id, password: f.password } });
        window.location.assign(r.redirect);
      })}>
        <Input label="Senha" name="password" type="password" autoComplete="new-password" hint="Pelo menos 8 caracteres, com letras e números." required error={error?.msg} />
        <Button type="submit" variant="brand" loading={busy} className="w-full">Concluir cadastro</Button>
      </form>
    </AuthFrame>
  );
}
