import type { Role } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { isValidCpf, onlyDigits } from "@/lib/cpf";
import { PASSWORD_MAX, PASSWORD_RULES } from "@/lib/password";
import { BOOKING_SIZES } from "@/lib/schedule";
import { DAY, startOfRecifeDay } from "@/lib/time";
import { AppError, badRequest, forbidden, notFound } from "../errors";
import { homeFor } from "../auth/jwt";
import { currentUser } from "../auth/session";
import * as cfg from "../repositories/config";
import { patientProfileType } from "../repositories/patients";
import * as usersRepo from "../repositories/users";
import { createGuidance, findTreatment, updateTreatment } from "../repositories/treatments";
import { allWaitlist, patientRequests } from "../repositories/requests";
import { purgeRateLimits } from "../repositories/rate-limit";
import * as auth from "../services/auth";
import { tick } from "../services/cron";
import { resetDemoStep, RESET_STEPS } from "../services/demo";
import * as late from "../services/late";
import * as metrics from "../services/metrics";
import * as notifications from "../services/notifications";
import * as patients from "../services/patients";
import * as payments from "../services/payments";
import * as renewals from "../services/renewals";
import * as reschedule from "../services/reschedule";
import * as schedule from "../services/schedule";
import * as sessions from "../services/sessions";
import * as uploads from "../services/uploads";
import * as waitlist from "../services/waitlist";
import * as whatsapp from "../services/whatsapp";
import bairrosRecife from "../../../data/bairros-recife.json";
import { route, type Ctx } from "./router";

const BAIRROS = new Set(bairrosRecife.bairros.map((b) => b.nome));

const FRONT_DESK: Role[] = ["ADMIN", "RECEPCAO"];
// A fisioterapeuta só entra onde a unidade não tem recepção: o serviço confere e recorta
const DESK_OR_PHYSIO: Role[] = ["ADMIN", "RECEPCAO", "FISIOTERAPEUTA"];
const CLINICAL: Role[] = ["ADMIN", "RECEPCAO", "FISIOTERAPEUTA"];
const PHYSIO: Role[] = ["ADMIN", "FISIOTERAPEUTA"];
const PATIENT: Role[] = ["PACIENTE"];
const ADMIN: Role[] = ["ADMIN"];

const AUTH_RATE = { limit: 10, windowSec: 60 };
const LOGIN_RATE = { limit: 20, windowSec: 60, perEmail: 8 };
const CODE_RATE = { limit: 5, windowSec: 300, perEmail: 3 };

export const MISS_REASONS = ["ALIVIO_DOR", "HORARIO", "TRANSPORTE", "CONVENIO", "SAUDE", "FINANCEIRO", "ESQUECIMENTO", "ATRASO", "OUTRO"] as const;

const email = z.string().trim().toLowerCase().email("E-mail inválido").max(160);
const password = z.string().max(PASSWORD_MAX, `Use no máximo ${PASSWORD_MAX} caracteres`)
  .superRefine((v, ctx) => {
    const missing = PASSWORD_RULES.find((r) => !r.test(v));
    if (missing) ctx.addIssue({ code: "custom", message: missing.label });
  });
const sameConfirm = { path: ["confirm"], message: "As senhas não coincidem" };
const matches = (v: { password: string; confirm: string }) => v.password === v.confirm;
const cpf = z.string().transform(onlyDigits).refine(isValidCpf, "CPF inválido");
const phone = z.string().transform(onlyDigits).refine((v) => v.length >= 10 && v.length <= 13, "Telefone inválido");
const optPhone = z.string().optional().transform((v) => (v ? onlyDigits(v) : undefined)).refine((v) => !v || v.length >= 10, "Telefone inválido");
const text = (max: number) => z.string().trim().min(1, "Obrigatório").max(max);
const optText = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);
const code = z.string().regex(/^\d{6}$/, "Digite os 6 dígitos");
const uuid = z.string().uuid();
const page = z.object({ take: z.coerce.number().int().min(1).max(100).default(30), skip: z.coerce.number().int().min(0).default(0), q: z.string().trim().max(80).optional() });

const bairro = z.string().trim().max(60).refine((v) => !v || BAIRROS.has(v), "Escolha um bairro da lista").transform((v) => v || undefined);

const patientData = z.object({
  cpf, email, name: text(120), phone,
  type: z.enum(["PARTICULAR", "CONVENIO"]),
  insurer: optText(80), cardNumber: optText(40),
  secondContactName: optText(120), secondContactPhone: optPhone,
  preferredUnitId: z.string().optional(),
  bairro: bairro.optional(),
  whatsappOptIn: z.boolean().optional(),
  consent: z.literal(true, { error: "É preciso aceitar para continuar" }),
}).refine((d) => d.type === "PARTICULAR" || (d.insurer && d.cardNumber), { path: ["insurer"], message: "Informe convênio e carteirinha" });

const period = z.object({
  from: z.coerce.date().optional(), to: z.coerce.date().optional(), unitId: z.string().optional(),
}).transform((q) => {
  const to = q.to ?? new Date();
  return { from: q.from ?? new Date(to.getTime() - 90 * DAY), to, unitId: q.unitId || undefined };
});

const dayQuery = z.object({ date: z.coerce.date().optional(), unitId: z.string().optional() }).transform((q) => {
  const from = startOfRecifeDay(q.date ?? new Date());
  return { from, to: new Date(from.getTime() + DAY), unitId: q.unitId || undefined };
});

const booking = z.object({
  unitId: z.string(), physioId: z.string().optional(),
  count: z.union([z.literal(BOOKING_SIZES.pacote), z.literal(BOOKING_SIZES.avulsa)]).default(BOOKING_SIZES.pacote),
  pattern: z.array(z.object({ weekday: z.number().int().min(1).max(6), hour: z.number().int().min(6).max(21) })).min(1).max(2),
}).refine((b) => b.pattern.length === (b.count === BOOKING_SIZES.avulsa ? 1 : 2), { path: ["pattern"], message: "Escolha 2 horários por semana no pacote e 1 na sessão avulsa" })
  .refine((b) => b.pattern.length === 1 || b.pattern[0].weekday !== b.pattern[1].weekday, { path: ["pattern"], message: "Escolha dias diferentes" });

const missBody = z.object({ status: z.enum(["FALTA", "DESMARCADA"]), reason: z.enum(MISS_REASONS), note: optText(300) });

const patientOf = (c: Ctx) => {
  const id = c.user.patient?.id;
  if (!id) throw forbidden();
  return id;
};

// ── Autenticação ─────────────────────────────────────────────
route("GET", "/auth/me", { roles: "public", summary: "Usuário da sessão atual" }, async () => {
  const u = await currentUser();
  return u ? { id: u.id, name: u.name, role: u.role, home: homeFor(u.role), onboarded: !!u.onboardedAt } : { id: null };
});
route("POST", "/auth/login", { roles: "public", rate: LOGIN_RATE, body: z.object({ email, password: z.string().min(1).max(72) }), summary: "Entrar com e-mail e senha" }, async ({ body }) => {
  const r = await auth.login(body.email, body.password);
  return { ...r, home: r.mustChangePassword ? "/trocar-senha" : homeFor(r.role) };
});
route("POST", "/auth/logout", { roles: "public", summary: "Sair" }, () => auth.logout());
route("POST", "/auth/register/start", { roles: "public", rate: CODE_RATE, body: patientData, summary: "Valida dados e envia o código por e-mail" },
  ({ body }) => auth.startRegistration(body));
route("POST", "/auth/register/verify", { roles: "public", rate: AUTH_RATE, body: z.object({ id: uuid, code }), summary: "Confere o código de 6 dígitos" },
  ({ body }) => auth.verifyRegistration(body.id, body.code));
route("POST", "/auth/register/complete", { roles: "public", rate: AUTH_RATE, body: z.object({ id: uuid, password, confirm: z.string() }).refine(matches, sameConfirm), summary: "Define a senha, com confirmação, e cria a conta" },
  ({ body }) => auth.completeRegistration(body.id, body.password));
route("POST", "/auth/forgot", { roles: "public", rate: CODE_RATE, body: z.object({ email }), summary: "Envia código de redefinição" },
  ({ body }) => auth.forgotPassword(body.email));
route("POST", "/auth/reset", { roles: "public", rate: AUTH_RATE, body: z.object({ id: uuid, code, password, confirm: z.string() }).refine(matches, sameConfirm), summary: "Redefine a senha com o código e a confirmação" },
  ({ body }) => auth.resetPassword(body.id, body.code, body.password));
route("POST", "/auth/password", { rate: AUTH_RATE, body: z.object({ current: z.string().min(1), next: password }), summary: "Troca a senha" },
  async ({ user, body }) => ({ ...(await auth.changePassword(user.id, body.current, body.next)), home: homeFor(user.role) }));

// ── Públicas: unidades e link de confirmação ─────────────────
route("GET", "/units", { roles: "public", summary: "Unidades ativas (dados quase estáticos)" }, async () =>
  (await cfg.listUnits()).map((u) => ({ id: u.id, code: u.code, name: u.name, physios: u.physios.map((p) => ({ id: p.id, name: p.user.name })) })));
route("GET", "/confirm/:token", { roles: "public", rate: { limit: 30, windowSec: 60 }, summary: "Dados do link de confirmação" }, ({ params }) => sessions.tokenInfo(params.token));
route("POST", "/confirm/:token", {
  roles: "public", rate: { limit: 10, windowSec: 60 },
  body: z.object({ action: z.enum(["confirmar", "trocar", "cancelar"]), reason: z.enum(MISS_REASONS).optional() }),
  summary: "Executa a ação do link (uso único)",
}, ({ params, body }) => sessions.tokenAction(params.token, body.action, body.reason));

// ── Paciente ─────────────────────────────────────────────────
route("GET", "/me/home", { roles: PATIENT, summary: "Dados da tela Meu tratamento" }, (c) => patients.patientHome(patientOf(c)));
route("POST", "/me/sessions/:id/confirm", { roles: PATIENT, summary: "Confirma presença" }, (c) => sessions.confirmSession(c.params.id, patientOf(c)));
route("GET", "/me/units", { roles: PATIENT, summary: "Unidades com horários dos próximos 7 dias" }, () => schedule.unitsOverview());
route("GET", "/slots", {
  roles: [...PATIENT, ...FRONT_DESK],
  query: z.object({ unitId: z.string(), days: z.coerce.number().int().min(1).max(30).default(14), physioId: z.string().optional() }),
  summary: "Horários livres de uma unidade",
}, async ({ query }) => (await schedule.availableSlots(query.unitId, new Date(), query.days, query.physioId)).map((s) => ({ startsAt: s.startsAt, peak: s.peak })));
route("GET", "/week-grid", {
  roles: [...PATIENT, ...FRONT_DESK], query: z.object({ unitId: z.string(), physioId: z.string().optional() }),
  summary: "Grade semanal para o wizard de agendamento",
}, ({ query }) => schedule.weekGrid(query.unitId, query.physioId));
route("GET", "/me/booking-info", { roles: PATIENT, summary: "Tipo do paciente e preço da sessão" }, async (c) => ({
  type: (await patientProfileType(patientOf(c))).type, priceCents: Math.round((await cfg.getSettings()).price_particular * 100),
}));
route("POST", "/me/treatment", {
  roles: PATIENT, rate: { limit: 10, windowSec: 60 }, body: booking,
  summary: "Agenda novo pacote ou sessão avulsa (particular gera cobrança PIX)",
}, (c) => schedule.bookTreatment({ ...c.body, patientId: patientOf(c) }, c.user.id));

route("GET", "/me/requests", { roles: PATIENT, summary: "Solicitações de troca do paciente" }, (c) => patientRequests(patientOf(c)));
route("POST", "/me/requests", {
  roles: PATIENT,
  body: z.object({ sessionId: z.string(), targetStartsAt: z.coerce.date(), targetUnitId: z.string(), reason: optText(300) }),
  summary: "Solicita troca de horário",
}, (c) => reschedule.createRequest(patientOf(c), c.body));
route("POST", "/me/requests/:id/cancel", { roles: PATIENT, summary: "Cancela a solicitação pendente" }, (c) => reschedule.cancelRequest(c.params.id, patientOf(c)));

route("GET", "/me/waitlist", { roles: PATIENT, summary: "Lista de espera do paciente" }, (c) => waitlist.patientWaitlist(patientOf(c)));
route("POST", "/me/waitlist", {
  roles: PATIENT, body: z.object({ unitId: z.string(), weekday: z.number().int().min(1).max(6), hour: z.number().int().min(6).max(21) }),
  summary: "Entra na lista de espera",
}, (c) => waitlist.joinWaitlist(patientOf(c), c.body));
route("POST", "/me/waitlist/:id/accept", { roles: PATIENT, summary: "Aceita a vaga ofertada" }, (c) => waitlist.acceptOffer(c.params.id, patientOf(c)));
route("DELETE", "/me/waitlist/:id", { roles: PATIENT, summary: "Sai da lista de espera" }, (c) => waitlist.leaveWaitlist(c.params.id, patientOf(c)));

route("GET", "/me/payments", { roles: PATIENT, summary: "Pagamentos do paciente" }, (c) => payments.patientPayments(patientOf(c)));
route("GET", "/me/payments/:id", { roles: PATIENT, summary: "Cobrança PIX: código, QR Code, status e recibo" }, (c) => payments.paymentView(c.params.id, patientOf(c)));
route("POST", "/me/late/:id/reply", { roles: PATIENT, body: z.object({ button: z.enum(["caminho5", "caminho15", "nao"]) }), summary: "Responde ao aviso de atraso pelo app" }, (c) => late.replyLate(c.params.id, c.body.button, patientOf(c)));
route("GET", "/me/late-offers", { roles: PATIENT, summary: "Vagas de hoje ofertadas ao paciente" }, (c) => late.patientOffers(patientOf(c)));
route("POST", "/me/late-offers/:id/reply", { roles: PATIENT, body: z.object({ button: z.enum(["sim", "nao"]) }), summary: "Aceita ou recusa a vaga (primeiro a confirmar leva)" }, (c) => late.replyOffer(c.params.id, c.body.button, patientOf(c)));
route("GET", "/me/profile", { roles: PATIENT, summary: "Perfil com CPF mascarado" }, ({ user }) => patients.profile(user.id));
route("PATCH", "/me/profile", {
  roles: PATIENT,
  body: z.object({
    name: text(120).optional(), phone: phone.optional(),
    secondContactName: z.string().trim().max(120).nullable().optional(),
    secondContactPhone: z.string().nullable().optional().transform((v) => (v ? onlyDigits(v) : v)),
    preferredUnitId: z.string().nullable().optional(), notifyEmail: z.boolean().optional(), notifyEducational: z.boolean().optional(), onboarded: z.boolean().optional(),
    bairro: bairro.nullable().optional(), whatsappOptIn: z.boolean().optional(),
  }),
  summary: "Atualiza perfil e preferências",
}, (c) => patients.updateProfile(c.user, patientOf(c), c.body));
route("GET", "/me/export", { roles: PATIENT, summary: "Baixa os dados pessoais (LGPD)" }, async (c) =>
  new Response(JSON.stringify(await patients.exportData(c.user, patientOf(c)), null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="meus-dados-movimento.json"' },
  }));
route("POST", "/me/delete", { roles: PATIENT, rate: AUTH_RATE, body: z.object({ password: z.string().min(1) }), summary: "Exclui a conta (LGPD)" }, async (c) => {
  await patients.deleteAccount(c.user, patientOf(c), c.body.password);
  await auth.logout();
});

// ── Notificações (todos os perfis) ───────────────────────────
route("GET", "/notifications", { summary: "Notificações e contador de não lidas" }, async ({ user }) => ({
  items: await notifications.listNotifications(user.id), unread: await notifications.countUnread(user.id),
}));
route("POST", "/notifications/read", { body: z.object({ id: z.string().optional() }), summary: "Marca como lida (uma ou todas)" },
  ({ user, body }) => notifications.markRead(user.id, body.id));
route("GET", "/files/:name", { summary: "Baixa arquivo enviado (restrito ao paciente dono e à equipe)" }, ({ params, user }) => uploads.readUpload(params.name, user));

// ── Recepção ─────────────────────────────────────────────────
const deskUnit = (c: Ctx) => (c.user.role === "RECEPCAO" ? (c.user.unitId ?? undefined) : undefined);

route("GET", "/desk/agenda", { roles: FRONT_DESK, query: dayQuery, summary: "Agenda do dia por unidade" }, ({ query }) => sessions.unitAgenda(query.unitId, query.from, query.to));
route("GET", "/desk/requests", { roles: DESK_OR_PHYSIO, summary: "Fila de solicitações com conflitos e alternativas" }, ({ user }) => reschedule.requestQueue(user));
route("POST", "/desk/requests/:id/approve", { roles: DESK_OR_PHYSIO, summary: "Aprova a troca" }, ({ params, user }) => reschedule.approveRequest(params.id, user));
route("POST", "/desk/requests/:id/reject", {
  roles: DESK_OR_PHYSIO, body: z.object({ response: text(300), suggestion: optText(200) }), summary: "Recusa com justificativa e sugestão",
}, ({ params, user, body }) => reschedule.rejectRequest(params.id, user, body));
route("GET", "/desk/renewals", { roles: DESK_OR_PHYSIO, summary: "Fila de renovações de convênio" }, ({ user }) => renewals.renewalQueue(user));
route("PATCH", "/desk/renewals/:id", {
  roles: DESK_OR_PHYSIO,
  body: z.object({ status: z.enum(["SOLICITADA", "EM_ANALISE", "LIBERADA", "NEGADA"]), note: optText(500), expectedAt: z.coerce.date().optional() }),
  summary: "Atualiza status, prazo e observação",
}, ({ params, user, body }) => renewals.updateRenewalStatus(params.id, body, user));
route("POST", "/desk/renewals/:id/release", { roles: DESK_OR_PHYSIO, summary: "Solta os horários pré-reservados" }, ({ params, user }) => renewals.releaseHeldSessions(params.id, user));
route("GET", "/desk/waitlist", { roles: FRONT_DESK, summary: "Lista de espera" }, (c) => allWaitlist(deskUnit(c)));
route("DELETE", "/desk/waitlist/:id", { roles: FRONT_DESK, summary: "Remove da lista de espera" }, ({ params }) => waitlist.leaveWaitlist(params.id, null));
route("GET", "/desk/patients", { roles: CLINICAL, query: page.extend({ ativos: z.literal("1").optional() }), summary: "Busca de pacientes" }, ({ user, query }) => patients.staffSearch(user, query.q, query.take, query.skip, !!query.ativos));
route("POST", "/desk/patients", { roles: FRONT_DESK, rate: { limit: 20, windowSec: 60 }, body: patientData, summary: "Cadastra paciente (CPF + e-mail)" },
  ({ user, body }) => patients.createPatientByStaff(user.id, { ...body, consent: true }));
route("POST", "/desk/patients/:id/treatment", {
  roles: FRONT_DESK, body: booking, summary: "Agenda em nome do paciente",
}, ({ params, user, body }) => schedule.bookTreatment({ ...body, patientId: params.id }, user.id));
route("GET", "/desk/payments", { roles: DESK_OR_PHYSIO, summary: "Pagamentos aguardando confirmação" }, ({ user }) => payments.pendingPayments(user));
route("POST", "/desk/payments/:id/confirm", { roles: DESK_OR_PHYSIO, summary: "Confirma o PIX manualmente" }, ({ params, user }) => payments.confirmManually(params.id, user));
route("POST", "/desk/payments/:id/reactivate", { roles: DESK_OR_PHYSIO, summary: "Reativa uma reserva de PIX vencida se os horários continuam livres" }, ({ params, user }) => schedule.reactivatePayment(params.id, user));
route("POST", "/desk/sessions/:id/checkin", { roles: DESK_OR_PHYSIO, summary: "Check-in; cancela ofertas de vaga pendentes" }, ({ params, user }) => late.checkIn(params.id, user));
route("POST", "/desk/sessions/:id/late", { roles: FRONT_DESK, summary: "Paciente atrasado: inicia o fluxo manualmente" }, ({ params, user }) => late.startLate(params.id, user.id));
route("GET", "/desk/sessions/:id/late", { roles: FRONT_DESK, summary: "Linha do tempo do atraso" }, ({ params }) => late.lateTimeline(params.id));
route("GET", "/desk/whatsapp", { roles: FRONT_DESK, summary: "Caixa do WhatsApp" }, async () => ({ simulated: !whatsapp.usingCloud(), messages: await whatsapp.inbox() }));
route("POST", "/desk/whatsapp/:id/reply", { roles: FRONT_DESK, body: z.object({ button: z.string().max(20) }), summary: "Responde como o paciente (só no modo simulado)" }, ({ params, body }) => {
  if (whatsapp.usingCloud()) throw forbidden();
  return late.handleWhatsAppReply(params.id, body.button);
});
route("POST", "/desk/sessions/:id/confirm", { roles: FRONT_DESK, summary: "Confirma presença em nome do paciente" }, ({ params }) => sessions.confirmSession(params.id, null));
route("POST", "/desk/sessions/:id/miss", { roles: FRONT_DESK, body: missBody, summary: "Registra falta ou desmarcação" }, ({ params, body, user }) => sessions.markMissed(params.id, body, user));

// ── Fisioterapeuta ───────────────────────────────────────────
route("GET", "/physio/agenda", { roles: PHYSIO, query: dayQuery, summary: "Agenda própria do dia" }, ({ user, query }) => {
  if (!user.physio) throw forbidden();
  return sessions.physioAgenda(user.physio.id, query.from, query.to);
});
route("POST", "/physio/sessions/:id/done", { roles: PHYSIO, summary: "Marca sessão como realizada" }, ({ params, user }) => sessions.markDone(params.id, user));
route("POST", "/physio/sessions/:id/miss", { roles: PHYSIO, body: missBody, summary: "Registra falta ou desmarcação com motivo" }, ({ params, body, user }) => sessions.markMissed(params.id, body, user));
route("GET", "/physio/treatments/:id", { roles: CLINICAL, summary: "Detalhe do tratamento (acesso auditado)" }, ({ params, user }) => patients.staffTreatmentDetail(user, params.id));
route("POST", "/physio/treatments/:id/abandon", {
  roles: PHYSIO, body: z.object({ reason: z.enum(MISS_REASONS), note: optText(300) }), summary: "Registra abandono",
}, ({ params, body, user }) => sessions.abandonTreatment(params.id, body.reason, body.note, user));
route("POST", "/physio/treatments/:id/script", { roles: PHYSIO, summary: "Conclui o roteiro de 1 minuto" }, async ({ params, user }) => {
  const t = await findTreatment(params.id);
  if (!t) throw notFound("Tratamento");
  if (user.role === "FISIOTERAPEUTA" && t.physioId !== user.physio?.id) throw forbidden();
  await updateTreatment(params.id, { scriptDoneAt: new Date() });
});
route("POST", "/physio/treatments/:id/guidance", { roles: PHYSIO, raw: true, summary: "Envia orientação (texto, link ou arquivo em multipart)" }, async ({ req, params, user }) => {
  if (!user.physio) throw forbidden();
  const t = await findTreatment(params.id);
  if (!t) throw notFound("Tratamento");
  if (t.physioId !== user.physio.id) throw forbidden();
  const form = await req.formData();
  const fields = z.object({
    title: text(120), message: optText(1000),
    url: z.string().trim().url("Link inválido").startsWith("https://", "Use um link https").optional().or(z.literal("").transform(() => undefined)),
  }).safeParse({ title: form.get("title") ?? "", message: form.get("message") ?? undefined, url: form.get("url") ?? undefined });
  if (!fields.success) throw new AppError(422, "VALIDACAO", fields.error.issues[0].message);
  const file = form.get("file");
  const fileName = file instanceof File && file.size ? await uploads.saveUpload(file) : undefined;
  if (!fields.data.message && !fields.data.url && !fileName) throw badRequest("Inclua uma mensagem, link ou arquivo.");
  await createGuidance({ ...fields.data, fileName, treatmentId: t.id, physioId: user.physio.id });
  await notifications.notify(t.patient.userId, {
    type: "ORIENTACAO", title: `Nova orientação: ${fields.data.title}`, body: fields.data.message ?? "Sua fisioterapeuta enviou um material para você.", href: "/app",
  });
  await cfg.audit(user.id, "ORIENTACAO_ENVIADA", "Treatment", t.id);
});

// ── Agendador: na Vercel não há processo contínuo, algo externo chama esta rota ──
route("GET", "/cron/tick", { roles: "public", summary: "Lembretes, atrasos, expirações e fila de e-mail (Bearer CRON_SECRET)" }, async ({ req }) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) throw forbidden();
  await tick();
  await purgeRateLimits();
});

// ── Webhooks (autenticados por assinatura) ───────────────────
route("POST", "/webhooks/pix", { roles: "public", raw: true, summary: "Confirmação automática do PSP (exige PIX_PROVIDER=psp e assinatura)" }, async ({ req }) => {
  await payments.handleWebhook(await req.text(), req.headers.get("x-webhook-signature"));
});
route("GET", "/webhooks/whatsapp", { roles: "public", summary: "Verificação do webhook pela Meta" }, async ({ req }) => {
  const u = new URL(req.url).searchParams;
  if (u.get("hub.verify_token") !== process.env.WHATSAPP_VERIFY_TOKEN || !process.env.WHATSAPP_VERIFY_TOKEN) throw forbidden();
  return new Response(u.get("hub.challenge") ?? "");
});
route("POST", "/webhooks/whatsapp", { roles: "public", raw: true, summary: "Respostas dos botões do WhatsApp (assinatura da Meta)" }, async ({ req }) => {
  const raw = await req.text();
  if (!whatsapp.validMetaSignature(raw, req.headers.get("x-hub-signature-256"))) throw forbidden();
  for (const r of whatsapp.repliesFromWebhook(JSON.parse(raw))) await late.handleWhatsAppReply(r.messageId, r.buttonId).catch(() => {});
});

// ── Administrador ────────────────────────────────────────────
route("GET", "/admin/dashboard", { roles: ADMIN, query: period, summary: "Métricas por período e unidade" }, ({ query }) => metrics.dashboard(query.from, query.to, query.unitId));
route("GET", "/admin/export.csv", { roles: ADMIN, query: period, summary: "Relatório de sessões em CSV (sem dados pessoais)" }, async ({ query, user }) => {
  await cfg.audit(user.id, "RELATORIO_EXPORTADO", "Session");
  return new Response(await metrics.sessionsCsv(query.from, query.to, query.unitId), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="sessoes-movimento.csv"' },
  });
});
route("GET", "/admin/users", { roles: ADMIN, query: page, summary: "Equipe" }, ({ query }) => usersRepo.listStaff(query.take, query.skip, query.q));
route("POST", "/admin/users", {
  roles: ADMIN,
  body: z.object({ email, name: text(120), role: z.enum(["RECEPCAO", "FISIOTERAPEUTA"]), unitId: z.string().min(1, "Escolha a unidade"), crefito: optText(20) }),
  summary: "Cria recepção ou fisioterapeuta e envia convite por e-mail",
}, async ({ body, user }) => {
  if (await usersRepo.findUserByEmail(body.email)) throw new AppError(409, "CONFLITO", "Já existe uma conta com este e-mail.");
  // Senha aleatória que ninguém conhece: o acesso nasce do convite
  const created = await usersRepo.createStaffUser({ ...body, passwordHash: await auth.hashPassword(randomBytes(24).toString("hex")) });
  await cfg.audit(user.id, "USUARIO_CRIADO", "User", created.id, { role: body.role });
  cfg.invalidate("units");
  const inviteSent = await auth.sendInvite(body.email, body.name).then(() => true, () => false);
  await cfg.audit(user.id, inviteSent ? "CONVITE_ENVIADO" : "CONVITE_FALHOU", "User", created.id);
  return { id: created.id, inviteSent };
});
route("DELETE", "/admin/users/:id", { roles: ADMIN, summary: "Desativa usuário da equipe" }, async ({ params, user }) => {
  if (params.id === user.id) throw badRequest("Você não pode desativar a própria conta.");
  await usersRepo.updateUser(params.id, { deletedAt: new Date(), tokenVersion: { increment: 1 } });
  await cfg.audit(user.id, "USUARIO_DESATIVADO", "User", params.id);
  cfg.invalidate("units");
});
route("POST", "/admin/users/:id/reactivate", { roles: ADMIN, summary: "Reativa usuário da equipe" }, async ({ params, user }) => {
  await usersRepo.updateUser(params.id, { deletedAt: null });
  await cfg.audit(user.id, "USUARIO_REATIVADO", "User", params.id);
  cfg.invalidate("units");
});
route("GET", "/admin/units", { roles: ADMIN, summary: "Unidades completas" }, () => cfg.listUnits());
route("PATCH", "/admin/units/:id", {
  roles: ADMIN,
  body: z.object({
    address: text(200).optional(), phone: text(20).optional(), chairs: z.number().int().min(1).max(50).optional(),
    openHour: z.number().int().min(5).max(12).optional(), closeHour: z.number().int().min(13).max(23).optional(),
    lateToleranceMin: z.number().int().min(0).max(60).optional(), slotHoldMin: z.number().int().min(1).max(120).optional(),
    saturdayEnabled: z.boolean().optional(), satOpenHour: z.number().int().min(6).max(12).optional(), satCloseHour: z.number().int().min(9).max(18).optional(),
    lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional(),
  }),
  summary: "Edita unidade, cadeiras, horários e sábado",
}, async ({ params, body, user }) => {
  await cfg.updateUnit(params.id, body);
  await cfg.audit(user.id, "UNIDADE_ALTERADA", "Unit", params.id, body);
});
route("GET", "/admin/holidays", { roles: ADMIN, summary: "Feriados" }, () => cfg.listHolidays());
route("POST", "/admin/holidays", {
  roles: ADMIN, body: z.object({ date: z.iso.date(), name: text(80), unitId: z.string().optional() }), summary: "Cadastra feriado",
}, async ({ body, user }) => {
  const h = await cfg.createHoliday({ ...body, date: new Date(body.date) });
  await cfg.audit(user.id, "FERIADO_CRIADO", "Holiday", h.id);
});
route("DELETE", "/admin/holidays/:id", { roles: ADMIN, summary: "Remove feriado" }, async ({ params, user }) => {
  await cfg.deleteHoliday(params.id);
  await cfg.audit(user.id, "FERIADO_REMOVIDO", "Holiday", params.id);
});
route("GET", "/admin/settings", { roles: ADMIN, summary: "Parâmetros" }, () => cfg.getSettings());
const n = (max: number) => z.number().min(0).max(max).optional();
route("PATCH", "/admin/settings", {
  roles: ADMIN,
  body: z.object({
    reschedule_min_hours: n(72), reschedule_limit: n(20), waitlist_hold_minutes: n(1440), pix_hold_minutes: n(1440), late_cancel_hours: n(48),
    count_late_cancel_as_no_show: z.boolean().optional(), renewal_estimate_days: n(30), renewal_alert_session: n(10), renewal_reminder_session: n(10),
    reminder_hours: z.array(z.number().int().min(1).max(168)).min(1).max(4).optional(),
    price_particular: n(10000), price_convenio: n(10000), baseline_noshow_pct: n(100),
  }),
  summary: "Atualiza parâmetros",
}, async ({ body, user }) => {
  await cfg.saveSettings(body);
  await cfg.audit(user.id, "PARAMETROS_ALTERADOS", "Setting", null, body);
});
route("GET", "/admin/messages", { roles: ADMIN, summary: "Textos educativos" }, () => cfg.listProgressMessages());
route("PATCH", "/admin/messages/:id", { roles: ADMIN, body: z.object({ text: text(800) }), summary: "Edita texto (incrementa a versão)" }, async ({ params, body, user }) => {
  await cfg.saveProgressMessage(params.id, body.text);
  await cfg.audit(user.id, "TEXTO_ALTERADO", "ProgressMessage", params.id);
});
route("POST", "/admin/demo/reset", { roles: ADMIN, body: z.object({ step: z.number().int().min(0).max(RESET_STEPS) }), summary: "Reseta os dados de demonstração, uma etapa por chamada" }, ({ body, user }) => resetDemoStep(body.step, user.id));
route("GET", "/admin/audit", { roles: ADMIN, query: page, summary: "Log de auditoria" }, ({ query }) => cfg.listAudit(query.take, query.skip));

