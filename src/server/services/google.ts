import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { SESSION_MINUTES } from "@/lib/calendar";
import { DAY } from "@/lib/time";
import { homeFor } from "../auth/jwt";
import type { CurrentUser } from "../auth/session";
import { seal, unseal } from "../crypto";
import { prisma } from "../db";
import { AppError } from "../errors";
import { audit } from "../repositories/config";

/**
 * Google Agenda da equipe, em uma direção (sistema → Google). Escopo mínimo: calendar.app.created só
 * cria calendários secundários e mexe nos eventos deles; a agenda pessoal do usuário fica inacessível.
 */
export const SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const REVOKE = "https://oauth2.googleapis.com/revoke";
const CAL = "https://www.googleapis.com/calendar/v3";
const COOKIE = "mv-google-oauth";
export const SYNC_ERROR = "Não foi possível sincronizar";

const env = () => ({
  id: process.env.GOOGLE_CLIENT_ID ?? "", secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  redirect: process.env.GOOGLE_REDIRECT_URI ?? "", key: process.env.GOOGLE_TOKEN_KEY ?? "",
});
export const googleConfigured = () => {
  const e = env();
  return process.env.GOOGLE_CALENDAR_ENABLED === "true" && !!(e.id && e.secret && e.redirect) && e.key.length >= 32;
};
const assertConfigured = () => { if (!googleConfigured()) throw new AppError(503, "GOOGLE_DESLIGADO", "Integração com Google Agenda não configurada"); };

// ── OAuth 2.0 com PKCE e state ───────────────────────────────

export function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function authUrl(o: { clientId: string; redirect: string; state: string; challenge: string }) {
  const u = new URL(AUTH);
  u.search = new URLSearchParams({
    client_id: o.clientId, redirect_uri: o.redirect, response_type: "code", scope: SCOPE,
    access_type: "offline", prompt: "consent", include_granted_scopes: "false",
    state: o.state, code_challenge: o.challenge, code_challenge_method: "S256",
  }).toString();
  return u.toString();
}

const sameString = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
/** O state volta do Google e precisa bater com o cookie (cifrado, httpOnly) e com o usuário logado. */
export function checkState(cookie: { state: string; uid: string } | null, state: string | null, userId: string) {
  return !!cookie && !!state && sameString(cookie.state, state) && cookie.uid === userId;
}

export function startConnect(user: CurrentUser) {
  assertConfigured();
  const e = env();
  const { verifier, challenge } = pkcePair();
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authUrl({ clientId: e.id, redirect: e.redirect, state, challenge }));
  res.cookies.set(COOKIE, seal(JSON.stringify({ state, verifier, uid: user.id }), e.key), {
    httpOnly: true, sameSite: "lax", secure: e.redirect.startsWith("https://"), path: "/api/google", maxAge: 600,
  });
  return res;
}

type Tokens = { access_token: string; refresh_token?: string; expires_in: number; scope?: string };

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const r = await fetch(TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body), signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new GoogleError(r.status, (await r.json().catch(() => ({})) as { error?: string }).error ?? "token");
  return r.json();
}

export async function finishConnect(req: Request, user: CurrentUser) {
  const back = (status: string) => NextResponse.redirect(new URL(`${homeFor(user.role)}?google=${status}`, req.url));
  if (!googleConfigured()) return back("desligado");
  const e = env();
  const url = new URL(req.url);
  const raw = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  let cookie: { state: string; verifier: string; uid: string } | null = null;
  try { cookie = raw ? JSON.parse(unseal(decodeURIComponent(raw), e.key)) : null; } catch { cookie = null; }
  const done = (res: NextResponse) => { res.cookies.delete({ name: COOKIE, path: "/api/google" }); return res; };
  if (!checkState(cookie, url.searchParams.get("state"), user.id)) return done(back("erro"));
  const code = url.searchParams.get("code");
  if (!code) return done(back("cancelado"));
  try {
    const t = await tokenRequest({ code, client_id: e.id, client_secret: e.secret, redirect_uri: e.redirect, grant_type: "authorization_code", code_verifier: cookie!.verifier });
    if (!t.refresh_token) throw new GoogleError(400, "sem refresh_token");
    if (t.scope && t.scope.split(" ").some((s) => s !== SCOPE)) throw new GoogleError(400, "escopo inesperado");
    const cal = await call<{ id: string }>(t.access_token, "POST", "/calendars", { summary: "Clínica Movimento", timeZone: "America/Sao_Paulo" });
    const data = { accessTokenEnc: seal(t.access_token, e.key), refreshTokenEnc: seal(t.refresh_token, e.key), expiresAt: new Date(Date.now() + t.expires_in * 1000), calendarId: cal.id, lastError: null };
    await prisma.googleConnection.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
    await prisma.googleEvent.deleteMany({ where: { userId: user.id } });
    await audit(user.id, "GOOGLE_CONECTADO", "GoogleConnection", user.id);
    await syncUser(user.id).catch(() => {});
    return done(back("conectado"));
  } catch {
    return done(back("erro"));
  }
}

// ── API do Calendar ──────────────────────────────────────────

export class GoogleError extends Error {
  constructor(public status: number, public reason: string) { super(`Google ${status}: ${reason}`); }
  get rateLimited() { return this.status === 429 || (this.status === 403 && /rate/i.test(this.reason)); }
}

async function call<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${CAL}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: { errors?: { reason?: string }[]; status?: string } };
    throw new GoogleError(r.status, j.error?.errors?.[0]?.reason ?? j.error?.status ?? "erro");
  }
  return (r.status === 204 ? undefined : await r.json()) as T;
}

// ── Sincronização (pura, testável) ───────────────────────────

export type SyncSession = { id: string; startsAt: Date; status: string; unitName: string; patientName: string };
const VISIBLE = new Set(["AGENDADA", "CONFIRMADA", "REALIZADA", "FALTA"]);
const STATUS_TEXT: Record<string, string> = { AGENDADA: "a confirmar", CONFIRMADA: "confirmada", REALIZADA: "realizada", FALTA: "falta" };

export const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 2 || /^[A-ZÀ-Ú]/.test(p));
  const pick = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return pick.map((p) => `${p[0].toUpperCase()}.`).join("");
};

/** Só iniciais (ou nome, se o usuário pediu), unidade e horário. Nunca CPF, telefone, e-mail, convênio, dor ou observações. */
export function eventFor(s: SyncSession, includeFullName: boolean) {
  const end = new Date(s.startsAt.getTime() + SESSION_MINUTES * 60_000);
  return {
    summary: `Sessão - ${includeFullName ? s.patientName : initials(s.patientName)}${s.status === "FALTA" ? " (falta)" : ""}`,
    location: s.unitName,
    description: `Unidade ${s.unitName}. Status: ${STATUS_TEXT[s.status] ?? s.status}. Evento criado pela Clínica Movimento.`,
    start: { dateTime: s.startsAt.toISOString(), timeZone: "America/Sao_Paulo" },
    end: { dateTime: end.toISOString(), timeZone: "America/Sao_Paulo" },
    status: "confirmed",
  };
}

/** Id determinístico (base32hex aceita 0-9a-v): a mesma sessão sempre vira o mesmo evento, sem duplicar. */
export const eventIdFor = (userId: string, sessionId: string) => `mv${createHash("sha256").update(`${userId}:${sessionId}`).digest("hex").slice(0, 38)}`;
const hashOf = (body: unknown) => createHash("sha256").update(JSON.stringify(body)).digest("base64url").slice(0, 22);

export type EventApi = {
  insert(eventId: string, body: unknown): Promise<void>;
  update(eventId: string, body: unknown): Promise<void>;
  remove(eventId: string): Promise<void>;
};

/**
 * Cria, atualiza e remove só o que mudou (hash do conteúdo). Reexecutar com o mesmo estado não chama a API.
 * Devolve o novo mapa sessão → hash, para gravar.
 */
export async function runSync(userId: string, sessions: SyncSession[], existing: Map<string, string>, includeFullName: boolean, api: EventApi) {
  const next = new Map(existing);
  const stats = { criados: 0, atualizados: 0, removidos: 0 };
  for (const s of sessions) {
    const id = eventIdFor(userId, s.id);
    if (!VISIBLE.has(s.status)) {
      if (!next.has(s.id)) continue;
      await api.remove(id).catch((e) => { if (!(e instanceof GoogleError && (e.status === 404 || e.status === 410))) throw e; });
      next.delete(s.id);
      stats.removidos++;
      continue;
    }
    const body = eventFor(s, includeFullName);
    const h = hashOf(body);
    if (next.get(s.id) === h) continue;
    if (next.has(s.id)) {
      await api.update(id, body).catch(async (e) => { if (e instanceof GoogleError && e.status === 404) await api.insert(id, body); else throw e; });
      stats.atualizados++;
    } else {
      // Já existe no Google (rodada anterior caiu antes de gravar): atualiza em vez de duplicar
      await api.insert(id, body).catch(async (e) => { if (e instanceof GoogleError && e.status === 409) await api.update(id, body); else throw e; });
      stats.criados++;
    }
    next.set(s.id, h);
  }
  return { next, stats };
}

// ── Execução no servidor ─────────────────────────────────────

async function accessToken(c: { userId: string; accessTokenEnc: string; refreshTokenEnc: string; expiresAt: Date }) {
  const e = env();
  if (c.expiresAt.getTime() - Date.now() > 60_000) return unseal(c.accessTokenEnc, e.key);
  const t = await tokenRequest({ client_id: e.id, client_secret: e.secret, grant_type: "refresh_token", refresh_token: unseal(c.refreshTokenEnc, e.key) });
  await prisma.googleConnection.update({ where: { userId: c.userId }, data: { accessTokenEnc: seal(t.access_token, e.key), expiresAt: new Date(Date.now() + t.expires_in * 1000) } });
  return t.access_token;
}

const scopeWhere = (u: { role: string; unitId: string | null; physio: { id: string } | null }) =>
  u.role === "FISIOTERAPEUTA" ? { physioId: u.physio?.id ?? "-" } : u.role === "RECEPCAO" && u.unitId ? { unitId: u.unitId } : {};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function syncUser(userId: string, { manual = false } = {}) {
  const c = await prisma.googleConnection.findUnique({ where: { userId } });
  if (!c) return null;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, unitId: true, physio: { select: { id: true } }, deletedAt: true } });
  if (!u || u.deletedAt) return null;
  const now = Date.now();
  const rows = await prisma.session.findMany({
    where: { ...scopeWhere(u), startsAt: { gte: new Date(now - 7 * DAY), lt: new Date(now + 60 * DAY) } },
    select: { id: true, startsAt: true, status: true, unit: { select: { name: true } }, patient: { select: { user: { select: { name: true } } } } },
    orderBy: { startsAt: "asc" }, take: 800,
  });
  const existingRows = await prisma.googleEvent.findMany({ where: { userId }, select: { sessionId: true, hash: true } });
  const existing = new Map(existingRows.map((r) => [r.sessionId, r.hash]));
  const path = (id: string) => `/calendars/${encodeURIComponent(c.calendarId)}/events/${id}`;
  try {
    let token = await accessToken(c);
    // Token expirado no meio: renova uma vez; limite de uso: espera curta e tenta de novo uma vez
    const send = async (fn: (t: string) => Promise<unknown>, retried = false): Promise<void> => {
      try { await fn(token); } catch (e) {
        if (!(e instanceof GoogleError) || retried) throw e;
        if (e.status === 401) { token = await accessToken({ ...c, expiresAt: new Date(0) }); return send(fn, true); }
        if (e.rateLimited) { await wait(1500); return send(fn, true); }
        throw e;
      }
    };
    const api: EventApi = {
      insert: (id, body) => send((t) => call(t, "POST", `/calendars/${encodeURIComponent(c.calendarId)}/events`, { ...(body as object), id })),
      update: (id, body) => send((t) => call(t, "PUT", path(id), body)),
      remove: (id) => send((t) => call(t, "DELETE", path(id))),
    };
    const { next, stats } = await runSync(userId, rows.map((s) => ({ id: s.id, startsAt: s.startsAt, status: s.status, unitName: s.unit.name, patientName: s.patient.user.name })), existing, c.includeFullName, api);
    const removed = [...existing.keys()].filter((k) => !next.has(k));
    const changed = [...next].filter(([k, h]) => existing.get(k) !== h);
    await prisma.$transaction([
      prisma.googleEvent.deleteMany({ where: { userId, sessionId: { in: removed } } }),
      ...changed.map(([sessionId, hash]) => prisma.googleEvent.upsert({
        where: { userId_sessionId: { userId, sessionId } }, create: { userId, sessionId, hash, eventId: eventIdFor(userId, sessionId) }, update: { hash },
      })),
      prisma.googleConnection.update({ where: { userId }, data: { lastSyncAt: new Date(), lastError: null } }),
    ]);
    if (manual || stats.criados + stats.atualizados + stats.removidos) await audit(userId, "GOOGLE_SINCRONIZADO", "GoogleConnection", userId, stats);
    return { ok: true as const, ...stats };
  } catch (e) {
    const reason = e instanceof GoogleError ? (e.rateLimited ? "limite de uso" : e.reason === "invalid_grant" ? "conexão expirada" : e.reason) : "falha de rede";
    await prisma.googleConnection.update({ where: { userId }, data: { lastError: `${SYNC_ERROR} (${reason})` } });
    await audit(userId, "GOOGLE_SINCRONIZACAO_FALHOU", "GoogleConnection", userId, { reason });
    return { ok: false as const, error: SYNC_ERROR };
  }
}

let running: Promise<void> | null = null;
let again = false;
/** Depois de cada escrita na API (agendou, trocou, cancelou, mudou status): sincroniza quem conectou. Falha em silêncio. */
export function syncConnectedSoon() {
  if (!googleConfigured()) return Promise.resolve();
  if (running) { again = true; return running; }
  running = (async () => {
    do {
      again = false;
      const users = await prisma.googleConnection.findMany({ select: { userId: true } });
      for (const u of users) await syncUser(u.userId).catch(() => {});
    } while (again);
  })().finally(() => { running = null; });
  return running;
}

export async function status(user: CurrentUser) {
  const c = await prisma.googleConnection.findUnique({ where: { userId: user.id }, select: { includeFullName: true, lastSyncAt: true, lastError: true, createdAt: true } });
  return { configured: googleConfigured(), connected: !!c, ...c, events: c ? await prisma.googleEvent.count({ where: { userId: user.id } }) : 0 };
}

export async function setIncludeFullName(user: CurrentUser, value: boolean) {
  await prisma.googleConnection.update({ where: { userId: user.id }, data: { includeFullName: value } });
  await audit(user.id, "GOOGLE_PREFERENCIA", "GoogleConnection", user.id, { nomeCompleto: value });
  await syncUser(user.id);
}

/** Revoga no Google, apaga os tokens locais e, se pedido, o calendário "Clínica Movimento" com os eventos. */
export async function disconnect(user: CurrentUser, removeEvents: boolean) {
  const c = await prisma.googleConnection.findUnique({ where: { userId: user.id } });
  if (!c) return;
  const key = env().key;
  if (removeEvents) await accessToken(c).then((t) => call(t, "DELETE", `/calendars/${encodeURIComponent(c.calendarId)}`)).catch(() => {});
  await fetch(`${REVOKE}?${new URLSearchParams({ token: unseal(c.refreshTokenEnc, key) })}`, { method: "POST", signal: AbortSignal.timeout(10_000) }).catch(() => {});
  await prisma.$transaction([prisma.googleEvent.deleteMany({ where: { userId: user.id } }), prisma.googleConnection.delete({ where: { userId: user.id } })]);
  await audit(user.id, "GOOGLE_DESCONECTADO", "GoogleConnection", user.id, { eventosRemovidos: removeEvents });
}
