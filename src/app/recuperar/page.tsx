"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { Button, Input } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

function Recuperar() {
  // Link de convite já traz a verificação: a pessoa vai direto ao código
  const invite = useSearchParams().get("id");
  const [id, setId] = useState(invite ?? "");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true); setError("");
    try {
      if (!id) setId((await api<{ verificationId: string }>("/auth/forgot", { body: f })).verificationId);
      else { await api("/auth/reset", { body: { id, ...f } }); setDone(true); }
    } catch (err) {
      setError(err instanceof ApiError && err.fields ? Object.values(err.fields)[0] : (err as Error).message);
    }
    setBusy(false);
  }

  if (done)
    return (
      <AuthFrame title="Senha redefinida" subtitle="Pronto. Agora é só entrar com a nova senha.">
        <Link href="/login" className="btn btn-brand w-full">Ir para o login</Link>
      </AuthFrame>
    );

  return (
    <AuthFrame title={invite ? "Crie sua senha" : "Recuperar acesso"} subtitle={invite ? "Use o código de 6 dígitos que veio no convite." : id ? "Se o e-mail estiver cadastrado, você recebeu um código de 6 dígitos." : "Informe seu e-mail e enviaremos um código."}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {!id ? <Input label="E-mail" name="email" type="email" required autoComplete="email" /> : (
          <>
            <Input label="Código" name="code" inputMode="numeric" maxLength={6} required autoComplete="one-time-code" />
            <Input label="Nova senha" name="password" type="password" required autoComplete="new-password" hint="Pelo menos 8 caracteres, com letras e números." />
          </>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button type="submit" variant="brand" loading={busy} className="w-full">{id ? "Redefinir senha" : "Enviar código"}</Button>
      </form>
      <Link href="/login" className="mt-4 flex min-h-11 items-center justify-center text-sm text-ink-2">Voltar para o login</Link>
    </AuthFrame>
  );
}

export default function RecuperarPage() {
  return <Suspense><Recuperar /></Suspense>;
}
