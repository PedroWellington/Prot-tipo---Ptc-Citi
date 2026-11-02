import type { Prisma } from "@prisma/client";
import { prisma, type Db } from "../db";

export const SETTING_DEFAULTS = {
  reschedule_min_hours: 2,
  reschedule_limit: 3,
  reminder_hours: [24, 2] as number[],
  waitlist_hold_minutes: 120,
  pix_hold_minutes: 30,
  late_cancel_hours: 2,
  count_late_cancel_as_no_show: false,
  renewal_estimate_days: 7,
  renewal_alert_session: 3,
  renewal_reminder_session: 4,
  price_particular: 110,
  price_convenio: 55,
  baseline_noshow_pct: 28,
};
export type Settings = typeof SETTING_DEFAULTS;

// Dados quase estáticos: cache por processo, invalidado na escrita
const TTL = 60_000;
const memo = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as T;
  const value = await load();
  memo.set(key, { at: Date.now(), value });
  return value;
}
export const invalidate = (key: string) => memo.delete(key);

export const getSettings = () =>
  cached("settings", async () => {
    const rows = await prisma.setting.findMany();
    return { ...SETTING_DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) } as Settings;
  });

export async function saveSettings(values: Partial<Settings>) {
  await prisma.$transaction(
    Object.entries(values).map(([key, value]) =>
      prisma.setting.upsert({ where: { key }, update: { value: value as Prisma.InputJsonValue }, create: { key, value: value as Prisma.InputJsonValue } }),
    ),
  );
  invalidate("settings");
}

export const listUnits = () =>
  cached("units", () =>
    prisma.unit.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      include: {
        physios: { where: { active: true, user: { deletedAt: null } }, select: { id: true, user: { select: { name: true } } } },
      },
    }),
  );
export const getUnit = async (id: string) => (await listUnits()).find((u) => u.id === id) ?? null;
export const updateUnit = async (id: string, data: Prisma.UnitUpdateInput) => {
  const unit = await prisma.unit.update({ where: { id }, data });
  invalidate("units");
  return unit;
};

export const listProgressMessages = () =>
  cached("messages", () => prisma.progressMessage.findMany({ orderBy: [{ totalSessions: "asc" }, { sessionNumber: "asc" }] }));

export async function saveProgressMessage(id: string, text: string) {
  const row = await prisma.progressMessage.update({ where: { id }, data: { text, version: { increment: 1 } } });
  invalidate("messages");
  return row;
}

export const listHolidays = (from?: Date) =>
  prisma.holiday.findMany({ where: from ? { date: { gte: from } } : undefined, orderBy: { date: "asc" }, include: { unit: { select: { name: true } } } });
export const createHoliday = (data: { date: Date; name: string; unitId?: string | null }) => prisma.holiday.create({ data });
export const deleteHoliday = (id: string) => prisma.holiday.delete({ where: { id } });

export const audit = (
  actorId: string | null | undefined,
  action: string,
  entity: string,
  entityId?: string | null,
  meta?: Prisma.InputJsonValue,
  db: Db = prisma,
) => db.auditLog.create({ data: { actorId: actorId ?? null, action, entity, entityId, meta } });

export const listAudit = (take: number, skip: number) =>
  prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" }, take, skip,
    select: { id: true, action: true, entity: true, entityId: true, createdAt: true, actor: { select: { name: true, role: true } } },
  });
