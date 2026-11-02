export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  }).catch(() => {
    throw new ApiError(0, "OFFLINE", "Sem conexão. Verifique sua internet e tente de novo.");
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/auth/") && !path.startsWith("/confirm")) location.href = "/login";
    throw new ApiError(res.status, data?.error?.code ?? "ERRO", data?.error?.message ?? "Algo saiu errado.", data?.error?.fields);
  }
  return data as T;
}
