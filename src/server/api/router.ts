import { Prisma, type Role } from "@prisma/client";
import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, type CurrentUser } from "../auth/session";
import { AppError, forbidden } from "../errors";
import { hitRateLimit } from "../repositories/rate-limit";
import { processQueue } from "../services/notifications";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

export type Ctx<B = unknown, Q = unknown> = {
  req: Request;
  params: Record<string, string>;
  body: B;
  query: Q;
  user: CurrentUser;
};

type Options<B extends z.ZodType, Q extends z.ZodType> = {
  /** Omitido = qualquer usuário autenticado. "public" = sem login. */
  roles?: Role[] | "public";
  body?: B;
  query?: Q;
  /** Por IP; perEmail limita também por e-mail do corpo, contra abuso distribuído em uma conta. */
  rate?: { limit: number; windowSec: number; perEmail?: number };
  /** multipart/form-data: o handler lê o corpo por conta própria. */
  raw?: boolean;
  summary: string;
};

export type RouteDef = {
  method: Method;
  path: string;
  segments: string[];
  options: Options<z.ZodType, z.ZodType>;
  handler: (ctx: Ctx<never, never>) => Promise<unknown>;
};

export const routes: RouteDef[] = [];

export function route<B extends z.ZodType = z.ZodUnknown, Q extends z.ZodType = z.ZodUnknown>(
  method: Method,
  path: string,
  options: Options<B, Q>,
  handler: (ctx: Ctx<z.output<B>, z.output<Q>>) => Promise<unknown>,
) {
  routes.push({ method, path, segments: path.split("/").filter(Boolean), options, handler: handler as RouteDef["handler"] });
}

function match(method: string, parts: string[]) {
  for (const r of routes) {
    if (r.method !== method || r.segments.length !== parts.length) continue;
    const params: Record<string, string> = {};
    if (r.segments.every((s, i) => (s.startsWith(":") ? ((params[s.slice(1)] = decodeURIComponent(parts[i])), true) : s === parts[i])))
      return { route: r, params };
  }
  return null;
}

async function rateLimit(key: string, limit: number, windowSec: number) {
  // Hash: a tabela não guarda IP nem e-mail
  const id = createHash("sha256").update(key).digest("base64url");
  if ((await hitRateLimit(id, windowSec)) > limit) throw new AppError(429, "MUITAS_TENTATIVAS", "Muitas tentativas. Aguarde um pouco.");
}

// Na Vercel o x-forwarded-for é definido pela plataforma, não pelo cliente
const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";

/** CSRF: além do SameSite=Lax, escrita só aceita a própria origem. */
function checkOrigin(req: Request) {
  if (req.method === "GET") return;
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== (req.headers.get("x-forwarded-host") ?? req.headers.get("host")))
    throw forbidden();
}

function fieldErrors(err: z.ZodError) {
  return Object.fromEntries(err.issues.map((i) => [i.path.join("."), i.message]));
}

export async function dispatch(req: Request, parts: string[]) {
  try {
    const found = match(req.method, parts);
    if (!found) throw new AppError(404, "ROTA", "Rota não encontrada.");
    const { route: r, params } = found;
    const { roles, body: bodySchema, query: querySchema, rate, raw } = r.options;

    checkOrigin(req);
    if (rate) await rateLimit(`${r.path}:${clientIp(req)}`, rate.limit, rate.windowSec);

    const user = roles === "public" ? null : await currentUser();
    if (roles !== "public") {
      if (!user) throw new AppError(401, "NAO_AUTENTICADO", "Sua sessão expirou. Entre novamente.");
      if (roles && !roles.includes(user.role)) throw forbidden();
    }

    let body: unknown;
    if (bodySchema && !raw) {
      const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) throw new AppError(422, "VALIDACAO", "Confira os campos destacados.", fieldErrors(parsed.error));
      body = parsed.data;
      const email = (body as { email?: string }).email;
      if (rate?.perEmail && email) await rateLimit(`${r.path}:email:${email}`, rate.perEmail, rate.windowSec);
    }
    let query: unknown;
    if (querySchema) {
      const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
      if (!parsed.success) throw new AppError(422, "VALIDACAO", "Parâmetros inválidos.", fieldErrors(parsed.error));
      query = parsed.data;
    }

    const result = await r.handler({ req, params, body, query, user: user! } as never);
    // Depois da resposta e do commit; no serverless um setTimeout morreria com a função
    if (req.method !== "GET") after(() => processQueue().catch(console.error));
    if (result instanceof Response) return result;
    return NextResponse.json(result ?? { ok: true });
  } catch (err) {
    if (err instanceof AppError)
      return NextResponse.json({ error: { code: err.code, message: err.message, fields: err.fields } }, { status: err.status });
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025")
      return NextResponse.json({ error: { code: "NAO_ENCONTRADO", message: "Registro não encontrado." } }, { status: 404 });
    // Só nome e código: o corpo do erro do Prisma pode citar CPF ou e-mail
    console.error("Erro na API:", (err as Error).name, (err as { code?: string }).code ?? "");
    return NextResponse.json({ error: { code: "INTERNO", message: "Algo saiu errado do nosso lado. Tente novamente." } }, { status: 500 });
  }
}
