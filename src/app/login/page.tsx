"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { PasswordInput } from "@/components/password-fields";
import { Button, Input } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { safeNext } from "@/lib/site-content";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const r = await api<{ home: string }>("/auth/login", { body: Object.fromEntries(form) });
      const params = new URLSearchParams(location.search);
      // Volta só para rotas internas; troca de senha obrigatória vem antes de tudo
      const back = safeNext(params.get("next") ?? params.get("volta"));
      location.href = back && r.home !== "/trocar-senha" ? back : r.home;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível entrar.");
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Que bom ver você" subtitle="Entre para acompanhar seu tratamento.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Input label="E-mail" name="email" type="email" autoComplete="email" required inputMode="email" />
        <PasswordInput label="Senha" name="password" autoComplete="current-password" required />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button type="submit" variant="brand" loading={busy} className="mt-2 w-full">{busy ? "Entrando…" : "Entrar"}</Button>
      </form>
      <div className="mt-6 flex items-center justify-between text-sm">
        <Link href="/recuperar" className="flex min-h-11 items-center text-ink-2 underline underline-offset-4">Esqueci minha senha</Link>
        <Link href="/cadastro" className="flex min-h-11 items-center font-semibold text-accent">Criar conta</Link>
      </div>
      <div className="mt-2 text-center">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-ink-3 underline-offset-4 hover:underline">Conhecer a clínica</Link>
      </div>
    </AuthFrame>
  );
}
