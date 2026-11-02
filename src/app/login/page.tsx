"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { Button, Input } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

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
      const back = new URLSearchParams(location.search).get("volta");
      // Volta só para caminhos internos
      location.href = back?.startsWith("/") && !back.startsWith("//") && r.home !== "/trocar-senha" ? back : r.home;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível entrar.");
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Que bom ver você" subtitle="Entre para acompanhar seu tratamento.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Input label="E-mail" name="email" type="email" autoComplete="email" required inputMode="email" />
        <Input label="Senha" name="password" type="password" autoComplete="current-password" required />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button type="submit" variant="brand" loading={busy} className="mt-2 w-full">{busy ? "Entrando…" : "Entrar"}</Button>
      </form>
      <div className="mt-6 flex items-center justify-between text-sm">
        <Link href="/recuperar" className="flex min-h-11 items-center text-ink-2 underline underline-offset-4">Esqueci minha senha</Link>
        <Link href="/cadastro" className="flex min-h-11 items-center font-semibold text-accent">Criar conta</Link>
      </div>
    </AuthFrame>
  );
}
