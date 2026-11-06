import { revalidatePath } from "next/cache";
import { BOOKING_SIZES } from "@/lib/schedule";
import { lines, mergeContent, SITE_FIELDS, SITE_KEYS } from "@/lib/site-content";
import type { CurrentUser } from "../auth/session";
import { prisma } from "../db";
import { notFound } from "../errors";
import { audit, listUnits } from "../repositories/config";

/**
 * Tudo que a página pública mostra, em uma chamada. Só dados institucionais: unidades, nomes fictícios da equipe
 * e textos. Nada de CPF, telefone ou e-mail de pessoas (o telefone é o da unidade).
 */
export async function siteData() {
  const [rows, units] = await Promise.all([prisma.siteContent.findMany({ select: { key: true, value: true } }), listUnits()]);
  const content = mergeContent(rows);
  const intros = lines(content["equipe.frases"]);
  const team = units.flatMap((u) => u.physios.map((p) => ({ name: p.user.name, unit: u.name })));
  return {
    content,
    units: units.map((u) => ({
      id: u.id, code: u.code, name: u.name, address: u.address, phone: u.phone, lat: u.lat, lng: u.lng,
      openHour: u.openHour, closeHour: u.closeHour, saturdayEnabled: u.saturdayEnabled, satOpenHour: u.satOpenHour, satCloseHour: u.satCloseHour,
      email: content[`contato.email.${u.code}`] ?? null,
    })),
    team: team.map((t, i) => ({ ...t, intro: intros.length ? intros[i % intros.length] : "" })),
    // Números do próprio cadastro; nada de "pacientes atendidos" ou "anos de experiência" inventados
    numbers: {
      units: units.length,
      physios: team.length,
      sessions: BOOKING_SIZES.pacote,
      perWeek: 2,
      openHour: Math.min(...units.map((u) => u.openHour)),
      closeHour: Math.max(...units.map((u) => u.closeHour)),
      saturday: units.some((u) => u.saturdayEnabled),
    },
  };
}
export type SiteData = Awaited<ReturnType<typeof siteData>>;

/** Saudação da área logada (Admin > Textos): padrões + o que foi salvo. Só leitura, só as chaves "saudacao.". */
export async function greetTexts(): Promise<Record<string, string>> {
  // Falhou a leitura: ficam os padrões (a saudação nunca derruba a área logada)
  const rows = await prisma.siteContent.findMany({ where: { key: { startsWith: "saudacao." } }, select: { key: true, value: true } }).catch(() => []);
  const all = mergeContent(rows);
  return Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith("saudacao.")));
}

export async function adminSiteContent() {
  const rows = await prisma.siteContent.findMany({ select: { key: true, value: true, updatedAt: true } });
  const saved = new Map(rows.map((r) => [r.key, r]));
  return SITE_FIELDS.map((f) => ({ ...f, value: saved.get(f.key)?.value ?? f.value, updatedAt: saved.get(f.key)?.updatedAt ?? null, default: f.value }));
}

/** Salva e publica: a página pública é regenerada na hora, sem esperar a revalidação. */
export async function saveSiteContent(user: CurrentUser, key: string, value: string) {
  if (!SITE_KEYS.has(key)) throw notFound("Texto");
  await prisma.siteContent.upsert({ where: { key }, update: { value }, create: { key, value } });
  await audit(user.id, "TEXTO_SITE_ALTERADO", "SiteContent", key);
  revalidatePath("/");
}
