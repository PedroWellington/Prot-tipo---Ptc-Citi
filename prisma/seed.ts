import { PrismaClient, type Prisma, type RenewalStatus, type SessionStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { MENSAGENS_PROGRESSO } from "../content/mensagens-progresso";
import dadosBairros from "../data/bairros-recife.json";
import { SETTING_DEFAULTS } from "../src/server/repositories/config";
import { weeklyOccurrences, type WeeklySlot } from "../src/lib/schedule";
import { DAY, HOUR } from "../src/lib/time";

const db = new PrismaClient();

// Endereços e telefones fictícios; coordenadas aproximadas dos bairros, a confirmar em Admin > Unidades
const UNITS = [
  { code: "BV", name: "Boa Viagem", address: "Rua das Acácias Imaginárias, 100, Boa Viagem", phone: "(81) 0000-0001", lat: -8.1197, lng: -34.906, chairs: 4 },
  { code: "CF", name: "Casa Forte", address: "Alameda dos Ipês Fictícios, 200, Casa Forte", phone: "(81) 0000-0002", lat: -8.0376, lng: -34.917, chairs: 3 },
];

const HOLIDAYS = [
  ["2026-11-15", "Proclamação da República"], ["2026-11-20", "Consciência Negra"], ["2026-12-08", "Nossa Senhora da Conceição"],
  ["2026-12-25", "Natal"], ["2027-01-01", "Confraternização Universal"],
] as const;

// Nomes inventados de propósito: não coincidem com pessoas reais conhecidas
const FIRST = ["Alvenira", "Brisael", "Calíope", "Dorvano", "Elisandra", "Fabrízia", "Galdino", "Helvira", "Isandro", "Jacélia", "Kelvano", "Lourisa", "Mirandel", "Nevina", "Orlandino", "Petrúcia", "Quirino", "Rosalvo", "Silvandra", "Tarcélia", "Ubirajane", "Valdirene", "Wesliana", "Xandrino", "Yasmirel", "Zelandro"];
const LAST = ["Vorlani", "Tremaris", "Quintavel", "Sorvelho", "Maravento", "Lindoval", "Brenhaus", "Cestarolli", "Dumarello", "Estrelanova", "Fontarelo", "Galvarim", "Horvatelli", "Ibarrosa", "Jandrovel"];
const REASONS = ["ALIVIO_DOR", "ALIVIO_DOR", "ALIVIO_DOR", "HORARIO", "HORARIO", "CONVENIO", "TRANSPORTE", "SAUDE", "ESQUECIMENTO"];
const INSURERS = ["Vida Plena Saúde", "Norte Saúde", "Maré Alta Assistência", "Bem Cuidar Convênios"];

// PRNG determinístico: a demonstração fica igual em toda instalação
let state = 20261102;
const rnd = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];

function fakeCpf() {
  const d = Array.from({ length: 9 }, () => Math.floor(rnd() * 10));
  for (const len of [9, 10]) {
    const sum = d.slice(0, len).reduce((a, v, i) => a + v * (len + 1 - i), 0);
    const r = (sum * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join("");
}
// Número de assinante iniciado em 0 não existe no plano de numeração: nunca toca o telefone de alguém
const phone = (i: number) => `8100000${String(i).padStart(4, "0")}`;

const usedNames = new Set<string>();
function fakeName(i: number) {
  // 1 + 5 × 26 = 131 é primo com 15: cada índice cai numa combinação diferente
  const name = `${FIRST[i % FIRST.length]} ${LAST[(Math.floor(i / FIRST.length) + 5 * i) % LAST.length]}`;
  if (usedNames.has(name)) throw new Error(`Nome repetido no seed: ${name}`);
  usedNames.add(name);
  return name;
}

async function base() {
  await db.setting.createMany({
    data: Object.entries(SETTING_DEFAULTS).map(([key, value]) => ({ key, value: value as Prisma.InputJsonValue })),
    skipDuplicates: true,
  });
  await db.progressMessage.createMany({
    data: Object.entries(MENSAGENS_PROGRESSO).map(([n, text]) => ({ sessionNumber: Number(n), totalSessions: 10, text })),
    skipDuplicates: true,
  });
  for (const u of UNITS) await db.unit.upsert({ where: { code: u.code }, update: {}, create: u });
}

async function demo() {
  const password = await bcrypt.hash(process.env.DEMO_PASSWORD!, 10);
  const now = new Date();
  const [bv, cf] = await Promise.all(UNITS.map((u) => db.unit.findUniqueOrThrow({ where: { code: u.code } })));

  await db.holiday.createMany({
    data: HOLIDAYS.filter(([d]) => new Date(d) > now).map(([date, name]) => ({ date: new Date(date), name })),
  });

  for (const [code, unit] of [["bv", bv], ["cf", cf]] as const)
    await db.user.create({ data: { email: `recepcao.${code}@exemplo.test`, name: code === "bv" ? "Lumélia Trevizani" : "Odalina Crestovale", passwordHash: password, role: "RECEPCAO", unitId: unit.id } });

  const physios = [];
  for (const [i, [name, unit]] of ([
    ["Dra. Aurelina Vendramoro", bv], ["Dr. Cassiel Montebrino", bv], ["Dra. Heloára Sanvitale", bv], ["Dra. Marineide Coltrano", cf], ["Dr. Otaviel Brandemar", cf],
  ] as const).entries()) {
    const user = await db.user.create({
      data: {
        email: `fisio${i + 1}@exemplo.test`, name, passwordHash: password, role: "FISIOTERAPEUTA", unitId: unit.id,
        physio: { create: { unitId: unit.id, crefito: `${100000 + i * 137}-F` } },
      },
      include: { physio: true },
    });
    physios.push(user.physio!);
  }

  const patient = async (idx: number, email: string, type: "PARTICULAR" | "CONVENIO", unitId: string, createdAt: Date) => {
    const user = await db.user.create({
      data: {
        email, name: fakeName(idx),
        passwordHash: password, role: "PACIENTE", createdAt, onboardedAt: idx === 0 ? null : createdAt,
        patient: {
          create: {
            cpf: fakeCpf(), phone: phone(idx), type, consentAt: createdAt, preferredUnitId: unitId,
            bairro: pick(dadosBairros.bairros).nome,
            // Um em cada cinco sem opt-in, para demonstrar o caminho por e-mail e app
            whatsappOptIn: idx % 5 !== 4, whatsappOptInAt: idx % 5 !== 4 ? createdAt : null,
            insurer: type === "CONVENIO" ? pick(INSURERS) : null,
            cardNumber: type === "CONVENIO" ? String(100000000 + Math.floor(rnd() * 899999999)) : null,
            secondContactName: idx % 2 ? `${FIRST[(idx + 5) % FIRST.length]} (familiar)` : null,
            secondContactPhone: idx % 2 ? phone(idx + 500) : null,
          },
        },
      },
      include: { patient: true },
    });
    return user.patient!;
  };

  // ── 25 pacientes ativos, um em cada fase (sessão 0 a 10) ──
  const patterns: WeeklySlot[][] = [];
  for (const hour of [8, 10, 14, 15, 17, 18])
    for (const [a, b] of [[1, 4], [2, 5]]) patterns.push([{ weekday: a, hour }, { weekday: b, hour }]);

  const closed = new Set<string>(HOLIDAYS.map(([d]) => d));
  const isClosed = (d: Date) => closed.has(new Date(d.getTime() - 3 * HOUR).toISOString().slice(0, 10));

  for (let i = 0; i < 25; i++) {
    const done = i % 11;
    const type = i % 2 ? "CONVENIO" : "PARTICULAR";
    const physioIdx = i % physios.length;
    const physio = physios[physioIdx];
    const pattern = patterns[Math.floor(i / physios.length) % patterns.length];
    const p = await patient(i, `paciente${String(i + 1).padStart(2, "0")}@exemplo.test`, type, physio.unitId, new Date(now.getTime() - (done + 2) * 4 * DAY));

    const occurrences = [...weeklyOccurrences(pattern, new Date(now.getTime() - 10 * 7 * DAY), 22)].filter((d) => !isClosed(d));
    const pastCount = done + (done >= 3 && i % 4 === 1 ? 1 : 0);
    const past = pastCount ? occurrences.filter((d) => d <= now).slice(-pastCount) : [];
    const future = occurrences.filter((d) => d > now).slice(0, 10 - done);
    const concluded = done === 10;

    const treatment = await db.treatment.create({
      data: {
        patientId: p.id, unitId: physio.unitId, physioId: physio.id, completedSessions: done,
        status: concluded ? "CONCLUIDO" : "ATIVO", endedAt: concluded ? now : null, startedAt: past[0] ?? now,
      },
    });

    let renewalStatus: RenewalStatus | null = null;
    if (type === "CONVENIO") {
      renewalStatus = done < 4 ? "NAO_INICIADA" : done === 4 ? "SOLICITADA" : done <= 6 ? "EM_ANALISE" : "LIBERADA";
      const requested = renewalStatus !== "NAO_INICIADA";
      await db.insuranceRenewal.create({
        data: {
          treatmentId: treatment.id, status: renewalStatus,
          alertedAt: done >= 3 ? now : null, remindedAt: done >= 4 ? now : null,
          requestedAt: requested ? new Date(now.getTime() - (done - 3) * 3 * DAY) : null,
          expectedAt: requested ? new Date(now.getTime() + 4 * DAY) : null,
          decidedAt: renewalStatus === "LIBERADA" ? new Date(now.getTime() - DAY) : null,
        },
      });
    }

    const rows: Prisma.SessionCreateManyInput[] = [];
    let number = 1;
    past.forEach((startsAt, idx) => {
      const missed = past.length > done && idx === Math.floor(past.length / 2);
      rows.push({
        treatmentId: treatment.id, patientId: p.id, unitId: physio.unitId, physioId: physio.id, startsAt, number,
        status: missed ? "FALTA" : "REALIZADA", reason: missed ? pick(REASONS) : null,
        confirmedAt: missed ? null : startsAt, doneAt: missed ? null : startsAt,
      });
      if (!missed) number++;
    });
    future.forEach((startsAt, idx) => {
      rows.push({
        treatmentId: treatment.id, patientId: p.id, unitId: physio.unitId, physioId: physio.id, startsAt, number: number + idx,
        status: idx === 0 && i % 3 === 0 ? "CONFIRMADA" : "AGENDADA", confirmedAt: idx === 0 && i % 3 === 0 ? now : null,
        provisional: type === "CONVENIO" && renewalStatus !== "LIBERADA" && number + idx > 5,
      });
    });
    await db.session.createMany({ data: rows });

    // Situações prontas para a demonstração
    if (i === 5 || i === 13) {
      const target = (await db.session.findFirst({ where: { treatmentId: treatment.id, status: { in: ["AGENDADA", "CONFIRMADA"] } }, orderBy: { startsAt: "asc" } }));
      if (target)
        await db.rescheduleRequest.create({
          data: {
            sessionId: target.id, patientId: p.id, targetUnitId: physio.unitId, reason: "Mudança no horário do trabalho",
            targetStartsAt: new Date(Math.floor((target.startsAt.getTime() + 3 * DAY) / HOUR) * HOUR + 3 * HOUR),
          },
        });
    }
    if (i === 8) await db.waitlistEntry.create({ data: { patientId: p.id, unitId: physio.unitId, weekday: 2, hour: 17 } });
  }

  // Lista de espera nos próximos horários, para a demonstração de atraso → oferta de vaga
  const soon = await db.session.findMany({
    where: { status: { in: ["AGENDADA", "CONFIRMADA"] }, startsAt: { gt: now } }, orderBy: { startsAt: "asc" }, take: 6,
    select: { patientId: true, unitId: true, startsAt: true },
  });
  const active = await db.treatment.findMany({ where: { status: "ATIVO" }, select: { patientId: true }, take: 12 });
  for (const [i, s] of soon.entries()) {
    const local = new Date(s.startsAt.getTime() - 3 * HOUR);
    const others = active.filter((t) => t.patientId !== s.patientId);
    for (const t of [others[i], others[i + 3]])
      if (t) await db.waitlistEntry.create({ data: { patientId: t.patientId, unitId: s.unitId, weekday: local.getUTCDay(), hour: local.getUTCHours() } });
  }

  const recep = await db.user.findFirstOrThrow({ where: { email: "recepcao.bv@exemplo.test" } });
  await db.notification.create({
    data: { userId: recep.id, type: "RENOVACAO", title: "Renovações na 3ª sessão", body: "Há pacientes de convênio prontos para dar entrada na liberação.", href: "/recepcao/renovacoes" },
  });

  // ── Histórico de 6 meses para o dashboard ──
  // Faltas de convênio saltam na 6ª sessão: 18% → 44%, o problema que o sistema ataca
  const noShowChance = (type: string, n: number) => (type === "PARTICULAR" ? 0.11 : n <= 5 ? 0.14 : n === 6 ? 0.44 : n === 7 ? 0.3 : 0.22);
  const histSessions: Prisma.SessionCreateManyInput[] = [];

  for (let i = 0; i < 160; i++) {
    const type = rnd() < 0.5 ? "CONVENIO" : "PARTICULAR";
    const physio = pick(physios);
    const startedAt = new Date(now.getTime() - (45 + Math.floor(rnd() * 140)) * DAY);
    const p = await patient(i + 25, `historico${i + 1}@exemplo.test`, type, physio.unitId, startedAt);
    const weekday = 1 + Math.floor(rnd() * 3);
    const hour = pick([7, 8, 8, 9, 10, 11, 13, 14, 15, 16, 17, 17, 18, 18, 19]);
    const dates = weeklyOccurrences([{ weekday, hour }, { weekday: weekday + 2, hour }], startedAt, 12);

    let done = 0, n = 1;
    let abandoned = false;
    const stopAt = rnd() < (type === "CONVENIO" ? 0.32 : 0.2) ? 4 + Math.floor(rnd() * 4) : 99;
    const rows: { startsAt: Date; status: SessionStatus; reason: string | null; noticeHours: number | null }[] = [];
    for (const startsAt of dates) {
      if (done === 10 || startsAt > now) break;
      if (n > stopAt) { abandoned = true; break; }
      const r = rnd();
      const noShow = noShowChance(type, n);
      const status: SessionStatus = r < noShow ? "FALTA" : r < noShow + 0.04 ? "DESMARCADA" : r < noShow + 0.07 ? "REAGENDADA" : "REALIZADA";
      rows.push({
        startsAt, status, reason: status === "FALTA" || status === "DESMARCADA" ? pick(REASONS) : null,
        noticeHours: status === "DESMARCADA" ? Math.round(rnd() * 30 * 10) / 10 : null,
      });
      if (status === "REALIZADA") { done++; n++; }
    }

    const finished = done === 10;
    const endedAt = rows.at(-1)?.startsAt ?? startedAt;
    const treatment = await db.treatment.create({
      data: {
        patientId: p.id, unitId: physio.unitId, physioId: physio.id, completedSessions: done, startedAt,
        status: finished ? "CONCLUIDO" : "ABANDONADO", endedAt, endReason: finished ? null : abandoned ? "ALIVIO_DOR" : "HORARIO",
      },
    });
    if (type === "CONVENIO" && done >= 3) {
      const requestedAt = rows[Math.min(4, rows.length - 1)].startsAt;
      await db.insuranceRenewal.create({
        data: {
          treatmentId: treatment.id, status: rnd() < 0.9 ? "LIBERADA" : "NEGADA", requestedAt,
          decidedAt: new Date(requestedAt.getTime() + (3 + Math.floor(rnd() * 8)) * DAY),
        },
      });
    }
    let num = 1;
    for (const r of rows) {
      histSessions.push({
        treatmentId: treatment.id, patientId: p.id, unitId: physio.unitId, physioId: physio.id, number: num, ...r,
        confirmedAt: rnd() < (r.status === "REALIZADA" ? 0.82 : 0.2) ? r.startsAt : null,
        doneAt: r.status === "REALIZADA" ? r.startsAt : null,
      });
      if (r.status === "REALIZADA") num++;
    }
    if (i % 8 === 0) {
      const offeredStartsAt = rows.at(-1)?.startsAt ?? startedAt;
      await db.waitlistEntry.create({
        data: { patientId: p.id, unitId: physio.unitId, weekday, hour, createdAt: startedAt, offeredStartsAt, status: i % 16 === 0 ? "EXPIRADA" : "ACEITA" },
      });
    }
    if (i % 4 === 0 && rows.length > 2) {
      const created = await db.session.create({ data: histSessions[histSessions.length - 1] as Prisma.SessionUncheckedCreateInput });
      histSessions.pop();
      await db.rescheduleRequest.create({
        data: {
          sessionId: created.id, patientId: p.id, targetUnitId: physio.unitId, targetStartsAt: new Date(created.startsAt.getTime() + DAY),
          status: rnd() < 0.8 ? "APROVADA" : "RECUSADA", createdAt: new Date(created.startsAt.getTime() - 2 * DAY),
          decidedAt: new Date(created.startsAt.getTime() - 2 * DAY + (1 + Math.floor(rnd() * 6)) * HOUR),
        },
      });
    }
  }
  await db.session.createMany({ data: histSessions });
}

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const pass = process.env.ADMIN_PASSWORD;
  if (!email || !pass) throw new Error("Defina ADMIN_EMAIL e ADMIN_PASSWORD");
  const production = process.env.APP_ENV === "production";

  await base();
  // Por perfil, não por e-mail: mudar ADMIN_EMAIL no .env não pode recriar os dados demo
  if (await db.user.count({ where: { role: "ADMIN" } })) return console.log("Seed: dados já existem, nada a fazer.");
  await db.user.create({
    data: { email, name: "Administração", passwordHash: await bcrypt.hash(pass, 12), role: "ADMIN", mustChangePassword: production },
  });
  if (!production) await demo();
  console.log(`Seed concluído (${production ? "produção: só admin" : "com dados de demonstração"}).`);
}

main().finally(() => db.$disconnect());
