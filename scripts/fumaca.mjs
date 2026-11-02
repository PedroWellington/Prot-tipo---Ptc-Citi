// Teste de fumaça de ponta a ponta contra o app rodando (npm start ou docker compose up) + Mailpit.
// Uso: node scripts/fumaca.mjs   Cria dados novos a cada execução; rode num banco de demonstração.
import assert from "node:assert/strict";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MAILPIT = process.env.MAILPIT ?? "http://localhost:8025";
const ADMIN = { email: process.env.ADMIN_EMAIL ?? "admin@exemplo.test", password: process.env.ADMIN_PASSWORD ?? "Movimento@2026" };
const DEMO = process.env.DEMO_PASSWORD ?? "Demo@2026";

function client() {
  let cookie = "";
  return async (path, { method, body, headers } = {}) => {
    const res = await fetch(`${BASE}/api${path}`, {
      method: method ?? (body ? "POST" : "GET"),
      headers: { "Content-Type": "application/json", cookie, ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  };
}

const ok = (r) => { assert.ok(r.status < 300, `${r.status} ${JSON.stringify(r.data)}`); return r.data; };
const step = (s) => console.log(`✓ ${s}`);

function fakeCpf() {
  const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  for (const len of [9, 10]) {
    const r = (d.slice(0, len).reduce((a, v, i) => a + v * (len + 1 - i), 0) * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join("");
}

async function mailCode(to) {
  for (let i = 0; i < 20; i++) {
    const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)).json();
    const code = messages?.[0]?.Subject.match(/\d{6}/)?.[0];
    if (code) return code;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Código não chegou para ${to}`);
}

async function login(email, password) {
  const c = client();
  ok(await c("/auth/login", { body: { email, password } }));
  return c;
}

async function register(type) {
  const c = client();
  const email = `fumaca-${Date.now()}-${Math.floor(Math.random() * 1e4)}@exemplo.test`;
  const start = ok(await c("/auth/register/start", {
    body: {
      cpf: fakeCpf(), email, name: `Fumaça ${type}`, phone: "81999990000", type, consent: true,
      ...(type === "CONVENIO" ? { insurer: "Vida Plena Saúde", cardNumber: "123456" } : {}),
    },
  }));
  ok(await c("/auth/register/verify", { body: { id: start.verificationId, code: await mailCode(email) } }));
  ok(await c("/auth/register/complete", { body: { id: start.verificationId, password: "Teste1234" } }));
  return c;
}

const admin = await login(ADMIN.email, ADMIN.password);
const recep = await login("recepcao.bv@exemplo.test", DEMO);
const units = ok(await client()("/units"));
const bv = units.find((u) => u.code === "BV");

// Validações do cadastro
{
  const c = client();
  const r = await c("/auth/register/start", { body: { cpf: "111.111.111-11", email: "x@y.co", name: "A", phone: "81999990000", type: "PARTICULAR", consent: true } });
  assert.equal(r.status, 422);
  assert.ok(r.data.error.fields.cpf);
  step("CPF inválido é rejeitado");
}

const conv = await register("CONVENIO");
step("Cadastro com CPF + e-mail + código de 6 dígitos");

// Escolhe dois horários livres da unidade em dias diferentes
const grid = ok(await conv(`/week-grid?unitId=${bv.id}`));
const free = grid.days.flatMap((d) => d.hours.filter((h) => h.level === "alta").map((h) => ({ weekday: d.weekday, hour: h.hour })));
const pattern = [free[0], free.find((f) => f.weekday !== free[0].weekday)];
ok(await conv("/me/treatment", { body: { unitId: bv.id, pattern } }));
let home = ok(await conv("/me/home"));
assert.equal(home.sessions.length, 10);
assert.equal(home.sessions.filter((s) => s.provisional).length, 5, "sessões 6–10 pré-reservadas");
assert.equal(home.renewal.status, "NAO_INICIADA");
step("Agendamento cria 10 sessões, 6 a 10 pré-reservadas no convênio");

// Dupla reserva: mesma fisioterapeuta, mesmo padrão, ao mesmo tempo
{
  const onlyPhysio = bv.physios[2].id;
  const g = free[free.length - 1];
  const a = await register("PARTICULAR");
  const b = await register("PARTICULAR");
  const body = { unitId: bv.id, physioId: onlyPhysio, pattern: [g, free.find((f) => f.weekday !== g.weekday)] };
  const [ra, rb] = await Promise.all([a("/me/treatment", { body }), b("/me/treatment", { body })]);
  assert.ok(ra.status < 300 || rb.status < 300, "uma reserva passa");
  const homes = await Promise.all([a("/me/home"), b("/me/home")]);
  const slots = homes.flatMap((h) => h.data.sessions ?? []).map((s) => s.startsAt);
  assert.equal(new Set(slots).size, slots.length, "nenhum horário duplicado");
  step(`Reservas simultâneas sem dupla reserva (${ra.status}/${rb.status})`);
}

// Avança sessões e confere mensagem + alerta na 3ª
const firstMessage = home.message;
const done = async (id) => ok(await admin(`/physio/sessions/${id}/done`, { body: {} }));
for (const s of home.sessions.slice(0, 3)) await done(s.id);
home = ok(await conv("/me/home"));
assert.equal(home.treatment.done, 3);
assert.notEqual(home.message, firstMessage);
step("Sessão realizada atualiza X de N e o texto educativo");

const notes = ok(await recep("/notifications"));
assert.ok(notes.items.some((n) => n.title.startsWith("Pedir renovação")), "alerta da 3ª sessão");
step("Alerta de renovação para a recepção na 3ª sessão");

const queue = ok(await recep("/desk/renewals"));
const renewal = queue.find((r) => r.treatment.id === home.treatment.id);
ok(await recep(`/desk/renewals/${renewal.id}`, { method: "PATCH", body: { status: "SOLICITADA" } }));
home = ok(await conv("/me/home"));
assert.equal(home.renewal.status, "SOLICITADA");
assert.ok(home.renewal.expectedAt);
step("Renovação solicitada aparece para o paciente");

// Falta: reposição ao fim do plano
const beforeActive = home.sessions.filter((s) => ["AGENDADA", "CONFIRMADA"].includes(s.status)).length;
ok(await admin(`/physio/sessions/${home.sessions[3].id}/miss`, { body: { status: "FALTA", reason: "ALIVIO_DOR" } }));
home = ok(await conv("/me/home"));
const active = home.sessions.filter((s) => ["AGENDADA", "CONFIRMADA"].includes(s.status));
assert.equal(active.length, beforeActive);
assert.deepEqual(active.map((s) => s.number), [4, 5, 6, 7, 8, 9, 10]);
step("Falta gera reposição e mantém a numeração");

// Troca de horário
const target = active[0];
const slots = ok(await conv(`/slots?unitId=${bv.id}&days=14`));
const free2 = slots.find((s) => !home.sessions.some((x) => x.startsAt === s.startsAt));
const req = ok(await conv("/me/requests", { body: { sessionId: target.id, targetStartsAt: free2.startsAt, targetUnitId: bv.id, reason: "Teste" } }));
assert.equal((await conv("/me/requests", { body: { sessionId: target.id, targetStartsAt: free2.startsAt, targetUnitId: bv.id } })).status, 409, "um pedido pendente por sessão");
home = ok(await conv("/me/home"));
assert.ok(home.pendingRequest);
assert.equal(home.sessions.find((s) => s.id === target.id).status, target.status, "horário original mantido");
ok(await recep(`/desk/requests/${req.id}/approve`, { body: {} }));
home = ok(await conv("/me/home"));
assert.equal(home.pendingRequest, null);
assert.ok(home.sessions.some((s) => s.startsAt === free2.startsAt && s.status === "AGENDADA"));
assert.equal(home.sessions.find((s) => s.id === target.id).status, "REAGENDADA");
step("Troca solicitada, original reservado, aprovada pela recepção");

// Liberação do convênio
ok(await recep(`/desk/renewals/${renewal.id}`, { method: "PATCH", body: { status: "LIBERADA" } }));
home = ok(await conv("/me/home"));
assert.equal(home.sessions.filter((s) => s.provisional).length, 0);
step("Renovação liberada confirma os horários pré-reservados");

// PIX: sessão avulsa de particular
const particular = await register("PARTICULAR");
const gridP = ok(await particular(`/week-grid?unitId=${bv.id}`));
const livre = gridP.days.flatMap((d) => d.hours.filter((h) => h.level === "alta").map((h) => ({ weekday: d.weekday, hour: h.hour })));
const reserva = ok(await particular("/me/treatment", { body: { unitId: bv.id, pattern: [livre[2]], count: 1 } }));
assert.ok(reserva.paymentId, "particular gera cobrança");
const pix = ok(await particular(`/me/payments/${reserva.paymentId}`));
assert.equal(pix.status, "AGUARDANDO");
assert.equal(pix.amountCents, 11000);
assert.match(pix.pixCode, /^000201/);
assert.match(pix.qr, /^data:image\/png/);
let homeP = ok(await particular("/me/home"));
assert.equal((await particular(`/me/sessions/${homeP.sessions[0].id}/confirm`, { body: {} })).status, 409, "sem pagamento não confirma");
assert.ok(ok(await recep("/desk/payments")).some((p) => p.id === reserva.paymentId));
ok(await recep(`/desk/payments/${reserva.paymentId}/confirm`, { body: {} }));
assert.equal((await recep(`/desk/payments/${reserva.paymentId}/confirm`, { body: {} })).status, 409, "confirma uma vez só");
assert.equal(ok(await particular(`/me/payments/${reserva.paymentId}`)).status, "PAGO");
ok(await particular(`/me/sessions/${homeP.sessions[0].id}/confirm`, { body: {} }));
assert.equal((await recep("/webhooks/pix", { body: { status: "PAID", txid: "x" } })).status, 404, "sem PSP, webhook não existe");
step("PIX: cobrança, sem confirmar antes de pagar, recepção confirma, recibo");

// Pacote extra de convênio entra no tratamento atual e reabre a guia
const extra = ok(await conv("/me/treatment", { body: { unitId: bv.id, pattern: [livre[3]], count: 1 } }));
assert.equal(extra.paymentId, null, "convênio não paga");
home = ok(await conv("/me/home"));
assert.equal(home.treatment.total, 11);
assert.equal(home.renewal.status, "NAO_INICIADA");
step("Sessão extra de convênio: sem PIX, volta para a fila de renovação");

// Atraso → WhatsApp → vaga disputada por dois da lista de espera
{
  const a = particular, c = await login("paciente03@exemplo.test", DEMO), d = await login("paciente05@exemplo.test", DEMO);
  ok(await c("/me/profile", { method: "PATCH", body: { whatsappOptIn: true } }));
  ok(await d("/me/profile", { method: "PATCH", body: { whatsappOptIn: true } }));
  const slot = (await a(`/week-grid?unitId=${bv.id}`)).data.days[2].hours.find((h) => h.level === "alta");
  const weekday = (await a(`/week-grid?unitId=${bv.id}`)).data.days[2].weekday;
  const r = ok(await a("/me/treatment", { body: { unitId: bv.id, pattern: [{ weekday, hour: slot.hour }], count: 1 } }));
  ok(await recep(`/desk/payments/${r.paymentId}/confirm`, { body: {} }));
  ok(await a("/me/profile", { method: "PATCH", body: { whatsappOptIn: true } }));
  const sessao = ok(await a("/me/home")).sessions.find((s) => s.payment?.id === r.paymentId);
  ok(await c("/me/waitlist", { body: { unitId: bv.id, weekday, hour: slot.hour } }));
  ok(await d("/me/waitlist", { body: { unitId: bv.id, weekday, hour: slot.hour } }));

  ok(await recep(`/desk/sessions/${sessao.id}/late`, { body: {} }));
  assert.equal((await recep(`/desk/sessions/${sessao.id}/late`, { body: {} })).status, 409, "um evento por sessão");
  let caixa = ok(await recep("/desk/whatsapp"));
  assert.equal(caixa.simulated, true);
  const pergunta = caixa.messages.find((m) => m.kind === "ATRASO" && !m.repliedAt && m.text.includes("ainda não chegou"));
  ok(await recep(`/desk/whatsapp/${pergunta.id}/reply`, { body: { button: "nao" } }));
  caixa = ok(await recep("/desk/whatsapp"));
  const ofertas = caixa.messages.filter((m) => m.kind === "VAGA" && !m.repliedAt);
  assert.ok(ofertas.length >= 2, "oferta para os dois");

  const [r1, r2] = await Promise.all(ofertas.slice(0, 2).map((m) => recep(`/desk/whatsapp/${m.id}/reply`, { body: { button: "sim" } })));
  assert.deepEqual([r1.status, r2.status].sort(), [200, 409], `um vence, o outro perde: ${JSON.stringify([r1, r2])} ${JSON.stringify(ofertas.map((m) => [m.contact, m.text]))}`);
  const tl = ok(await recep(`/desk/sessions/${sessao.id}/late`));
  assert.equal(tl.status, "PREENCHIDA");
  assert.ok(tl.steps.some((s) => s.action === "VAGA_PREENCHIDA"));
  assert.equal((await recep(`/desk/sessions/${sessao.id}/checkin`, { body: {} })).status, 409, "chegou tarde: avisa para reagendar");
  step("Atraso: WhatsApp simulado, oferta, dois aceites simultâneos e só um leva a vaga");
}

// Unidades e LGPD
const overview = ok(await conv("/me/units"));
assert.equal(overview.length, 2);
const prof = ok(await conv("/me/profile"));
assert.match(prof.cpf, /^\*\*\*\.\d{3}\.\d{3}-\*\*$/);
step("CPF mascarado e unidades com horários");

// Segurança
assert.equal((await conv("/admin/dashboard")).status, 403);
assert.equal((await client()("/me/home")).status, 401);
assert.equal((await conv("/auth/logout", { body: {}, headers: { origin: "https://site-malicioso.example" } })).status, 403);
step("RBAC, autenticação e bloqueio de origem externa (CSRF)");

const victim = particular;
const me = ok(await victim("/me/profile"));
const email = me.user.email;
const c = client();
let last;
for (let i = 0; i < 5; i++) last = await c("/auth/login", { body: { email, password: "errada-123" } });
assert.equal(last.status, 423);
assert.equal((await c("/auth/login", { body: { email, password: "Teste1234" } })).status, 423);
step("Bloqueio temporário após 5 tentativas erradas");

const dash = ok(await admin(`/admin/dashboard?from=${new Date(Date.now() - 180 * 864e5).toISOString()}`));
assert.ok(dash.bySessionNumber[5].convenio > dash.bySessionNumber[4].convenio, "salto na 6ª");
step(`Dashboard: faltas de convênio ${dash.bySessionNumber[4].convenio}% na 5ª → ${dash.bySessionNumber[5].convenio}% na 6ª`);

console.log("\nTudo certo.");
