import { createHmac, randomInt, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { VerificationPurpose } from "@prisma/client";
import { emailChannel } from "../channels";
import { clearSessionCookie, setSessionCookie } from "../auth/session";
import { AppError, badRequest, conflict } from "../errors";
import { audit } from "../repositories/config";
import * as users from "../repositories/users";

const CODE_TTL_MS = 15 * 60_000;
const MAX_CODE_ATTEMPTS = 5;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_MS = 15 * 60_000;
const ROUNDS = 12;

export const hashPassword = (p: string) => bcrypt.hash(p, ROUNDS);
// Mantém o tempo de resposta igual quando o e-mail não existe
const DUMMY_HASH = bcrypt.hashSync("nao-existe", ROUNDS);

const codeHash = (id: string, code: string) => createHmac("sha256", process.env.JWT_SECRET!).update(`${id}:${code}`).digest("hex");

async function sendCode(purpose: VerificationPurpose, email: string, payload?: object) {
  const id = randomUUID();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await users.createVerification({
    id, purpose, email, codeHash: codeHash(id, code), payload: payload as never, expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  const title = purpose === "CADASTRO" ? "Seu código de verificação" : "Redefinição de senha";
  await emailChannel.send({
    to: email, subject: `${title}: ${code}`,
    text: `Use o código ${code} para continuar. Ele vale por 15 minutos.\nSe não foi você, pode ignorar este e-mail.`,
  });
  return id;
}

async function checkCode(id: string, code: string, purpose: VerificationPurpose) {
  const v = await users.findVerification(id, purpose);
  const invalid = new AppError(400, "CODIGO_INVALIDO", "Código incorreto ou expirado.");
  if (!v || v.consumedAt || v.expiresAt < new Date()) throw invalid;
  if (v.attempts >= MAX_CODE_ATTEMPTS) throw new AppError(429, "MUITAS_TENTATIVAS", "Muitas tentativas. Peça um novo código.");
  if (v.codeHash !== codeHash(id, code)) {
    await users.updateVerification(id, { attempts: { increment: 1 } });
    throw invalid;
  }
  return v;
}

export type RegisterPayload = {
  cpf: string; email: string; name: string; phone: string; type: "PARTICULAR" | "CONVENIO";
  insurer?: string; cardNumber?: string; secondContactName?: string; secondContactPhone?: string; preferredUnitId?: string;
  bairro?: string; whatsappOptIn?: boolean;
};

export async function startRegistration({ consent: _consent, ...data }: RegisterPayload & { consent: true }) {
  if (await users.emailOrCpfTaken(data.email, data.cpf)) throw conflict("Já existe uma conta com este CPF ou e-mail.");
  return { verificationId: await sendCode("CADASTRO", data.email, data) };
}

export async function verifyRegistration(id: string, code: string) {
  await checkCode(id, code, "CADASTRO");
  await users.updateVerification(id, { verifiedAt: new Date() });
  return { ok: true };
}

export async function completeRegistration(id: string, password: string) {
  const v = await users.findVerification(id, "CADASTRO");
  if (!v?.verifiedAt || v.consumedAt || Date.now() - v.verifiedAt.getTime() > CODE_TTL_MS) throw badRequest("Verificação expirada. Comece novamente.");
  const p = v.payload as RegisterPayload;
  if (await users.emailOrCpfTaken(p.email, p.cpf)) throw conflict("Já existe uma conta com este CPF ou e-mail.");
  if (!(await users.consumeVerification(id))) throw badRequest("Verificação já utilizada.");
  const { name, email, ...profile } = p;
  const user = await users.createPatientUser({
    email, name, passwordHash: await hashPassword(password), profile: { ...profile, consentAt: new Date(), whatsappOptInAt: profile.whatsappOptIn ? new Date() : null },
  });
  await audit(user.id, "CONTA_CRIADA", "User", user.id, { consentimento: true });
  await setSessionCookie({ sub: user.id, role: "PACIENTE", tv: 0, mcp: false });
  return { redirect: "/app" };
}

export async function login(email: string, password: string) {
  const user = await users.findUserByEmail(email);
  const locked = new AppError(423, "BLOQUEADO", "Muitas tentativas. Tente novamente em 15 minutos.");
  if (user?.lockedUntil && user.lockedUntil > new Date()) throw locked;

  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || user.deletedAt || !ok) {
    if (user) {
      const failed = user.failedLogins + 1;
      await users.updateUser(user.id, failed >= MAX_LOGIN_ATTEMPTS
        ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) }
        : { failedLogins: failed });
      await audit(user.id, "LOGIN_FALHOU", "User", user.id);
      if (failed >= MAX_LOGIN_ATTEMPTS) throw locked;
    }
    throw new AppError(401, "CREDENCIAIS", "E-mail ou senha incorretos.");
  }
  if (user.failedLogins || user.lockedUntil) await users.updateUser(user.id, { failedLogins: 0, lockedUntil: null });
  await audit(user.id, "LOGIN", "User", user.id);
  await setSessionCookie({ sub: user.id, role: user.role, tv: user.tokenVersion, mcp: user.mustChangePassword });
  return { role: user.role, mustChangePassword: user.mustChangePassword };
}

export const logout = clearSessionCookie;

/** Resposta idêntica exista ou não a conta, para não revelar e-mails cadastrados. */
export async function forgotPassword(email: string) {
  const user = await users.findUserByEmail(email);
  if (user && !user.deletedAt) return { verificationId: await sendCode("SENHA", email) };
  return { verificationId: randomUUID() };
}

export async function resetPassword(id: string, code: string, password: string) {
  const v = await checkCode(id, code, "SENHA");
  if (!(await users.consumeVerification(id))) throw badRequest("Código já utilizado.");
  const user = await users.findUserByEmail(v.email);
  if (!user) throw badRequest("Conta não encontrada.");
  await users.updateUser(user.id, {
    passwordHash: await hashPassword(password), tokenVersion: { increment: 1 }, mustChangePassword: false, lockedUntil: null, failedLogins: 0,
  });
  await audit(user.id, "SENHA_REDEFINIDA", "User", user.id);
}

export async function changePassword(userId: string, current: string, next: string) {
  const user = await users.findUserById(userId);
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) throw new AppError(400, "SENHA_ATUAL", "A senha atual está incorreta.");
  const updated = await users.updateUser(userId, {
    passwordHash: await hashPassword(next), tokenVersion: { increment: 1 }, mustChangePassword: false,
  });
  await audit(userId, "SENHA_ALTERADA", "User", userId);
  await setSessionCookie({ sub: userId, role: updated.role, tv: updated.tokenVersion, mcp: false });
  return { redirect: updated.role === "PACIENTE" ? "/app" : undefined };
}

/** Conta criada pela recepção/admin: a pessoa define a senha com o código recebido por e-mail. */
export const sendPasswordSetup = (email: string) => sendCode("SENHA", email);
