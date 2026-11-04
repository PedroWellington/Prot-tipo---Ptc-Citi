import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { seal, unseal } from "../crypto";
import { authUrl, checkState, eventFor, eventIdFor, GoogleError, initials, pkcePair, runSync, SCOPE, type EventApi, type SyncSession } from "./google";

describe("OAuth do Google Agenda (simulado)", () => {
  it("PKCE S256: o desafio é o SHA-256 do verificador", () => {
    const { verifier, challenge } = pkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });
  it("URL com state, PKCE, acesso offline e só o escopo de calendários criados pelo app", () => {
    const u = new URL(authUrl({ clientId: "id.apps.googleusercontent.com", redirect: "https://exemplo.test/api/google/callback", state: "st4te", challenge: "ch4ll" }));
    expect(u.searchParams.get("state")).toBe("st4te");
    expect(u.searchParams.get("code_challenge")).toBe("ch4ll");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/calendar.app.created");
    expect(u.searchParams.get("scope")).toBe(SCOPE);
    expect(u.searchParams.get("scope")).not.toMatch(/auth\/calendar$|calendar\.readonly|calendar\.events$/);
    expect(u.searchParams.get("access_type")).toBe("offline");
  });
  it("state precisa bater com o cookie e com o usuário logado", () => {
    expect(checkState({ state: "abc", uid: "u1" }, "abc", "u1")).toBe(true);
    expect(checkState({ state: "abc", uid: "u1" }, "abd", "u1")).toBe(false);
    expect(checkState({ state: "abc", uid: "u1" }, "abc", "u2")).toBe(false);
    expect(checkState(null, "abc", "u1")).toBe(false);
    expect(checkState({ state: "abc", uid: "u1" }, null, "u1")).toBe(false);
  });
  it("tokens cifrados com AES-GCM: não aparecem no texto guardado e não abrem com outra chave", () => {
    const key = "k".repeat(40);
    const s = seal("ya29.token-secreto", key);
    expect(s).not.toContain("token-secreto");
    expect(unseal(s, key)).toBe("ya29.token-secreto");
    expect(() => unseal(s, "x".repeat(40))).toThrow();
  });
});

const session = (id: string, status = "AGENDADA"): SyncSession => ({ id, status, startsAt: new Date("2026-11-05T17:00:00Z"), unitName: "Boa Viagem", patientName: "Maria da Silva Souza" });

function fakeApi() {
  const events = new Map<string, unknown>();
  const calls: string[] = [];
  const api: EventApi = {
    async insert(id, body) { calls.push(`insert ${id}`); if (events.has(id)) throw new GoogleError(409, "duplicate"); events.set(id, body); },
    async update(id, body) { calls.push(`update ${id}`); if (!events.has(id)) throw new GoogleError(404, "notFound"); events.set(id, body); },
    async remove(id) { calls.push(`remove ${id}`); if (!events.delete(id)) throw new GoogleError(410, "deleted"); },
  };
  return { api, events, calls };
}

describe("Sincronização com o Google Agenda", () => {
  it("é idempotente: a segunda rodada com o mesmo estado não chama a API", async () => {
    const g = fakeApi();
    const a = await runSync("u1", [session("s1"), session("s2")], new Map(), false, g.api);
    expect(a.stats).toEqual({ criados: 2, atualizados: 0, removidos: 0 });
    g.calls.length = 0;
    const b = await runSync("u1", [session("s1"), session("s2")], a.next, false, g.api);
    expect(g.calls).toEqual([]);
    expect(b.stats).toEqual({ criados: 0, atualizados: 0, removidos: 0 });
    expect(g.events.size).toBe(2);
  });
  it("rodada que caiu antes de gravar não duplica: o id do evento é determinístico", async () => {
    const g = fakeApi();
    await runSync("u1", [session("s1")], new Map(), false, g.api);
    const again = await runSync("u1", [session("s1")], new Map(), false, g.api); // estado local perdido
    expect(g.events.size).toBe(1);
    expect(again.stats.criados).toBe(1);
    expect(eventIdFor("u1", "s1")).toBe(eventIdFor("u1", "s1"));
    expect(eventIdFor("u1", "s1")).toMatch(/^[0-9a-v]{5,1024}$/);
  });
  it("muda status → atualiza; desmarca → remove", async () => {
    const g = fakeApi();
    const a = await runSync("u1", [session("s1")], new Map(), false, g.api);
    const b = await runSync("u1", [session("s1", "CONFIRMADA")], a.next, false, g.api);
    expect(b.stats.atualizados).toBe(1);
    const c = await runSync("u1", [session("s1", "DESMARCADA")], b.next, false, g.api);
    expect(c.stats.removidos).toBe(1);
    expect(g.events.size).toBe(0);
    expect(c.next.has("s1")).toBe(false);
  });
  it("evento só com iniciais, unidade e horário; nome completo só se pedido", () => {
    const e = eventFor({ ...session("s1"), patientName: "Maria da Silva Souza" }, false);
    expect(e.summary).toBe("Sessão - M.S.");
    expect(JSON.stringify(e)).not.toMatch(/Maria|Souza|cpf|telefone|@/i);
    expect(eventFor(session("s1"), true).summary).toBe("Sessão - Maria da Silva Souza");
    expect(initials("Ana")).toBe("A.");
  });
});
