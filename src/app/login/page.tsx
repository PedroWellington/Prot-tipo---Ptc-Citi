"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { enterPortal, portalCancel, preloadPortal, SHELL_PATH } from "@/components/portal";
import { centerOf } from "@/lib/theme";
import { PasswordInput } from "@/components/password-fields";
import { Button, Input } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { safeNext } from "@/lib/site-content";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  // O portal fica pronto antes do clique: no ocioso depois da primeira pintura (e no hover/foco do botão)
  useEffect(() => {
    const idle = globalThis.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 300));
    idle(() => void preloadPortal(), { timeout: 2000 } as IdleRequestOptions);
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    // Portal: começa no clique, em paralelo com a autenticação (a lógica do login não muda)
    const button = submitRef.current;
    enterPortal(button ? centerOf(button) : { x: innerWidth / 2, y: innerHeight / 2 });
    try {
      const r = await api<{ home: string }>("/auth/login", { body: Object.fromEntries(form) });
      const params = new URLSearchParams(location.search);
      // Volta só para rotas internas; troca de senha obrigatória vem antes de tudo
      const back = safeNext(params.get("next") ?? params.get("volta"));
      const target = back && r.home !== "/trocar-senha" ? back : r.home;
      // Área logada: navegação do cliente (o portal continua na tela e explode quando o painel montar).
      // Fora dela (troca de senha obrigatória): o portal recolhe e a página abre normalmente
      if (SHELL_PATH.test(new URL(target, location.origin).pathname)) router.push(target);
      else { portalCancel(); location.href = target; }
    } catch (err) {
      // Falhou: as partículas voltam ao botão, o formulário fica livre e o campo balança de leve
      portalCancel();
      setError(err instanceof ApiError ? err.message : "Não foi possível entrar.");
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
        formRef.current?.animate([0, -6, 6, -4, 4, 0].map((x) => ({ transform: `translateX(${x}px)` })), { duration: 320, easing: "ease-out" });
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Que bom ver você" subtitle="Entre para acompanhar seu tratamento.">
      <form ref={formRef} onSubmit={submit} className="flex flex-col gap-4">
        <Input label="E-mail" name="email" type="email" autoComplete="email" required inputMode="email" />
        <PasswordInput label="Senha" name="password" autoComplete="current-password" required />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button ref={submitRef} type="submit" variant="brand" loading={busy} onPointerEnter={() => void preloadPortal()} onFocus={() => void preloadPortal()} className="mt-2 w-full">{busy ? "Entrando…" : "Entrar"}</Button>
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
