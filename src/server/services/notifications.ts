import type { Prisma } from "@prisma/client";
import { emailChannel, whatsAppCloudChannel, type Message } from "../channels";
import { prisma, type Db } from "../db";
import * as repo from "../repositories/notifications";

export type Notice = {
  type: string;
  title: string;
  body: string;
  href?: string;
  /** false = só no app (avisos internos da equipe). */
  email?: boolean;
  actions?: { label: string; url: string }[];
  /** Mensagem educativa: respeita a preferência própria do paciente. */
  educational?: boolean;
};

const MAX_ATTEMPTS = 3;

export async function notify(userId: string, n: Notice, db: Db = prisma) {
  const prefs = await repo.patientNotifyPrefs(userId, db);
  if (n.educational && prefs && !prefs.notifyEducational) return;
  const wantsEmail = n.email !== false && (prefs?.notifyEmail ?? true);
  await repo.createNotification(
    {
      userId, type: n.type, title: n.title, body: n.body, href: n.href,
      actions: n.actions as Prisma.InputJsonValue | undefined,
      emailStatus: wantsEmail ? "PENDENTE" : "IGNORADO",
    },
    db,
  );
  if (wantsEmail) scheduleFlush();
}

const physioHref = (href?: string) => (href === "/recepcao" ? "/fisio" : href === "/recepcao/pacientes" ? "/fisio/pacientes" : href);

/** Avisos da recepção da unidade. Sem recepção, vão à fisioterapeuta do paciente; sem ela, à administração. */
export async function notifyDesk(unitId: string | null, physioId: string | null, n: Notice, db: Db = prisma) {
  const desk = await repo.usersByRole("RECEPCAO", unitId, db);
  if (desk.length) return void (await Promise.all(desk.map((u) => notify(u.id, { ...n, email: false }, db))));
  const physio = physioId ? await repo.physioUserId(physioId, db) : null;
  if (physio) return notify(physio, { ...n, email: false, href: physioHref(n.href) }, db);
  const admins = await repo.usersByRole("ADMIN", null, db);
  await Promise.all(admins.map((u) => notify(u.id, { ...n, email: false }, db)));
}

let flushTimer: ReturnType<typeof setTimeout> | undefined;
// Espera o commit da transação; se ainda não tiver commitado, o próximo tick pega
function scheduleFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void processQueue().catch(console.error), 1500);
}

let running = false;

/** Fila de e-mails com retentativa; esgotou, tenta o segundo contato. */
export async function processQueue() {
  if (running) return;
  running = true;
  try {
    for (const item of await repo.dueEmails()) {
      const message: Message = {
        to: item.user.email, subject: item.title, text: item.body,
        actions: (item.actions as Message["actions"]) ?? undefined,
      };
      try {
        await emailChannel.send(message);
        await repo.updateNotification(item.id, { emailStatus: "ENVIADO", attempts: { increment: 1 } });
      } catch (err) {
        const attempts = item.attempts + 1;
        const failed = attempts >= MAX_ATTEMPTS;
        await repo.updateNotification(item.id, {
          attempts,
          emailStatus: failed ? "FALHOU" : "PENDENTE",
          nextAttemptAt: new Date(Date.now() + 2 ** attempts * 60_000),
        });
        console.error(`Falha no e-mail ${item.id} (tentativa ${attempts}):`, (err as Error).message);
        if (failed) await trySecondContact(item);
      }
    }
  } finally {
    running = false;
  }
}

async function trySecondContact(item: Awaited<ReturnType<typeof repo.dueEmails>>[number]) {
  const p = item.user.patient;
  if (!p) return;
  if (whatsAppCloudChannel.enabled) {
    try {
      await whatsAppCloudChannel.send({ to: p.phone, subject: item.title, text: item.body });
      return;
    } catch {
      if (p.secondContactPhone) {
        const ok = await whatsAppCloudChannel.send({ to: p.secondContactPhone, subject: item.title, text: item.body }).then(() => true, () => false);
        if (ok) return;
      }
    }
  }
  // Sem canal automático para telefone: a recepção recebe a tarefa de ligar
  const contact = p.secondContactPhone ? `Segundo contato: ${p.secondContactName ?? ""} ${p.secondContactPhone}.` : "Sem segundo contato cadastrado.";
  await notifyDesk(p.preferredUnitId, null, {
    type: "CONTATO_FALHOU", title: `Não conseguimos avisar ${item.user.name}`,
    body: `O aviso "${item.title}" falhou por e-mail. Telefone: ${p.phone}. ${contact}`,
  });
}

export const listNotifications = repo.listNotifications;
export const countUnread = repo.countUnread;
export const markRead = repo.markRead;
