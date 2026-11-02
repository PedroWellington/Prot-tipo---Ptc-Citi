"use client";

import { useState, type FormEvent } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { Button, Input } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

export default function TrocarSenhaPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await api<{ home: string }>("/auth/password", { body: Object.fromEntries(new FormData(e.currentTarget)) });
      location.href = r.home;
    } catch (err) {
      setError(err instanceof ApiError && err.fields ? Object.values(err.fields)[0] : (err as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Defina uma nova senha" subtitle="Por segurança, troque a senha inicial antes de continuar.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Input label="Senha atual" name="current" type="password" autoComplete="current-password" required />
        <Input label="Nova senha" name="next" type="password" autoComplete="new-password" hint="Pelo menos 8 caracteres, com letras e números." required />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button type="submit" variant="brand" loading={busy} className="w-full">Salvar</Button>
      </form>
    </AuthFrame>
  );
}
