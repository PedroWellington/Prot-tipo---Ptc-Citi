"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { NewPasswordFields } from "@/components/password-fields";
import { PatientForm } from "@/components/patient-form";
import { enterPortal, portalCancel, preloadPortal, SHELL_PATH } from "@/components/portal";
import { Button, Input } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { passwordReady } from "@/lib/password";
import { centerOf } from "@/lib/theme";
import { EMAIL_NOTE, maskEmail, RESEND_SECONDS, resendWait, safeNext } from "@/lib/site-content";

const CONSENT = "Autorizo a Clínica Movimento a tratar meus dados pessoais e de saúde para o meu atendimento, conforme a LGPD. Posso baixar ou excluir meus dados a qualquer momento no meu perfil.";

export default function CadastroPage() {
  const [step, setStep] = useState<"dados" | "codigo" | "senha">("dados");
  const [id, setId] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<{ field?: string; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ password: "", confirm: "" });
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(0);
  const [resending, setResending] = useState(false);
  const wait = sentAt ? resendWait(sentAt, now) : 0;
  const router = useRouter();
  // Última etapa (senha): o portal fica pronto antes de "Concluir cadastro"
  useEffect(() => { if (step === "senha") void preloadPortal(); }, [step]);

  // Contagem regressiva do reenvio: um tique por segundo só enquanto falta tempo
  useEffect(() => {
    if (step !== "codigo" || !sentAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step, sentAt]);

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

  const sent = (verificationId: string) => { const t = Date.now(); setId(verificationId); setSentAt(t); setNow(t); };

  const resend = async () => {
    setResending(true); setError(null);
    try {
      const r = await api<{ verificationId: string }>("/auth/register/resend", { body: { id } });
      sent(r.verificationId);
    } catch (err) {
      setError({ msg: err instanceof Error ? err.message : "Não foi possível reenviar agora." });
    }
    setResending(false);
  };

  return (
    <>
      {/* Etapa de dados fica montada (só escondida): "Trocar e-mail" volta sem perder o que foi digitado */}
      <div hidden={step !== "dados"}>
        <AuthFrame title="Vamos começar" subtitle="Só precisamos do seu CPF e e-mail, e de alguns dados para cuidar bem de você.">
          <PatientForm submitLabel="Continuar" consentLabel={CONSENT} emailNote={EMAIL_NOTE} onSubmit={async (data) => {
            const r = await api<{ verificationId: string }>("/auth/register/start", { body: data });
            sent(r.verificationId); setEmail(String(data.email)); setError(null); setStep("codigo");
          }} />
          <p className="mt-6 text-center text-sm text-ink-2">Já tem conta? <Link href="/login" className="font-semibold text-accent">Entrar</Link></p>
        </AuthFrame>
      </div>

      {step === "codigo" && (
        <AuthFrame title="Confira seu e-mail" subtitle="Digite o código de 6 dígitos. Ele vale por 15 minutos.">
          <form className="flex flex-col gap-4" onSubmit={run(async (f) => {
            await api("/auth/register/verify", { body: { id, code: f.code } });
            setStep("senha");
          })}>
            <Input label="Código" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" required error={error?.msg}
              note={<>Enviamos um código para <b className="font-semibold">{maskEmail(email)}</b>. Não chegou? Olhe o spam ou reenvie.</>}
              className="field text-center text-2xl tracking-[.4em]" />
            <Button type="submit" variant="brand" loading={busy} className="w-full">Verificar</Button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="line" className="min-w-44 flex-1" disabled={wait > 0} loading={resending} onClick={resend} aria-describedby="reenvio">
              {wait > 0 ? `Reenviar código (${wait} s)` : resending ? "Enviando…" : "Reenviar código"}
            </Button>
            <Button variant="ghost" className="flex-1" onClick={() => { setError(null); setStep("dados"); }}>Trocar e-mail</Button>
          </div>
          <p id="reenvio" className="sr-only" aria-live="polite">{wait > 0 ? `Você pode pedir outro código em ${wait} segundos.` : "Você já pode pedir outro código."}</p>
          <p className="mt-2 text-xs text-ink-3">Um novo código a cada {RESEND_SECONDS} segundos, no máximo 5 pedidos a cada 5 minutos.</p>
        </AuthFrame>
      )}

      {step === "senha" && (
        <AuthFrame title="Crie sua senha" subtitle="Tudo certo com seu e-mail. Falta só a senha de acesso.">
          <form className="flex flex-col gap-4" onSubmit={run(async () => {
            // Portal de entrada: começa no clique de "Concluir cadastro", em paralelo com a criação da conta
            const btn = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
            enterPortal(btn ? centerOf(btn) : { x: innerWidth / 2, y: innerHeight / 2 });
            let r: { redirect: string };
            try { r = await api<{ redirect: string }>("/auth/register/complete", { body: { id, ...pw } }); } catch (err) { portalCancel(); throw err; }
            // Veio de "Agendar tratamento" na página da clínica: segue para Agendar
            const target = safeNext(new URLSearchParams(location.search).get("next")) ?? r.redirect;
            if (SHELL_PATH.test(new URL(target, location.origin).pathname)) router.push(target);
            else { portalCancel(); window.location.assign(target); }
          })}>
            <NewPasswordFields value={pw} onChange={setPw} error={error?.msg} />
            <Button type="submit" variant="brand" loading={busy} disabled={!passwordReady(pw.password, pw.confirm)} className="w-full">Concluir cadastro</Button>
          </form>
        </AuthFrame>
      )}
    </>
  );
}
