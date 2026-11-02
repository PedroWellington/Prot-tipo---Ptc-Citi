"use client";

import { keepPreviousData, MutationCache, QueryClient, QueryClientProvider, useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";

// Só o componente visual é adiado; toast() é leve e enfileira até ele montar
const Toaster = dynamic(() => import("sonner").then((m) => m.Toaster), { ssr: false });

export const haptic = (ms = 10) => {
  try { navigator.vibrate?.(ms); } catch { /* sem suporte */ }
};

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    mutationCache: new MutationCache({
      onError: (err) => toast.error(err.message || "Não foi possível concluir. Tente novamente."),
    }),
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 30 * 60_000,
        // Troca de dia ou filtro mantém a tela anterior até a nova chegar
        placeholderData: keepPreviousData,
        refetchOnWindowFocus: true,
        retry: (count, err) => count < 2 && !(err instanceof ApiError && err.status >= 400 && err.status < 500),
      },
    },
  }));

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster position="top-center" offset={36} mobileOffset={36} theme="system" toastOptions={{ style: { background: "var(--surface-2)", color: "var(--ink)", border: "1px solid var(--line-strong)" } }} />
    </QueryClientProvider>
  );
}

/**
 * Ação com atualização otimista: aplica `optimistic` no cache na hora,
 * reverte se falhar e revalida em segundo plano no fim.
 */
export function useAction<V = void, R = unknown>(opts: {
  run: (vars: V) => Promise<R>;
  invalidate?: QueryKey[];
  optimistic?: { key: QueryKey; update: (old: never, vars: V) => unknown };
  success?: string;
  onDone?: (r: R) => void;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: opts.run,
    onMutate: async (vars) => {
      haptic();
      if (!opts.optimistic) return;
      const { key, update } = opts.optimistic;
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData(key);
      qc.setQueryData(key, (old: never) => (old ? update(old, vars) : old));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (opts.optimistic && ctx) qc.setQueryData(opts.optimistic.key, ctx.previous);
    },
    onSuccess: (r) => {
      if (opts.success) toast.success(opts.success);
      opts.onDone?.(r);
    },
    onSettled: () => {
      for (const key of opts.invalidate ?? []) qc.invalidateQueries({ queryKey: key });
      if (opts.optimistic) qc.invalidateQueries({ queryKey: opts.optimistic.key });
    },
  });
}
