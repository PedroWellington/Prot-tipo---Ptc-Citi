import { CalendarCheck, ChevronDown, Clock, Dumbbell, HeartHandshake, Home, Mail, MapPin, Navigation, Phone, ShieldCheck, Sparkles, Stethoscope, Users, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site/header";
import { ClinicArt, HeroArt, SPECIALTY_ART } from "@/components/site/illustrations";
import { LazyMap } from "@/components/site/lazy-map";
import { lines, mergeContent } from "@/lib/site-content";
import { SITE_IMAGES } from "@/lib/site-images";
import { NOTA_ENDERECO } from "@/lib/unidades";
import { siteData, type SiteData } from "@/server/services/site";

// Estática, regenerada a cada 5 minutos (e na hora quando o admin salva um texto)
export const revalidate = 300;

export const metadata: Metadata = {
  title: { absolute: "Clínica Movimento · Fisioterapia em Boa Viagem e Casa Forte" },
  description: "Fisioterapia do primeiro dia à alta: avaliação, sessões, exercícios em casa e acompanhamento. Clínica fictícia de demonstração.",
  // Demonstração fictícia: fora dos buscadores
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  openGraph: { title: "Clínica Movimento", description: "Fisioterapia do primeiro dia à alta. Clínica fictícia de demonstração.", type: "website", locale: "pt_BR" },
};

const AGENDAR = "/login?next=%2Fapp%2Fagendar";

async function load(): Promise<SiteData> {
  try {
    return await siteData();
  } catch {
    // Banco fora do ar na geração: publica os textos padrão; a próxima revalidação traz os dados
    return { content: mergeContent([]), units: [], team: [], numbers: { units: 2, physios: 0, sessions: 10, perWeek: 2, openHour: 7, closeHour: 20, saturday: false } };
  }
}

const initials = (name: string) => name.split(" ").filter((w) => !w.endsWith(".")).slice(0, 2).map((w) => w[0]).join("");

function Section({ id, eyebrow, title, children, className }: { id: string; eyebrow?: string; title?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={title ? `${id}-t` : undefined} className={`site-section mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20 ${className ?? ""}`}>
      {eyebrow && <p className="mb-2 text-sm font-semibold tracking-wide text-accent uppercase">{eyebrow}</p>}
      {title && <h2 id={`${id}-t`} className="mb-8 font-display text-[34px] leading-tight sm:text-[44px]">{title}</h2>}
      {children}
    </section>
  );
}

function Photo({ name, alt, sizes, className }: { name: keyof typeof SITE_IMAGES; alt: string; sizes: string; className?: string }) {
  const img = SITE_IMAGES[name];
  return (
    <Image src={`/site/${name}-{w}.webp`} alt={alt} width={img.width} height={img.height} sizes={sizes} placeholder="blur" blurDataURL={img.blur}
      loading="lazy" className={`h-full w-full object-cover ${className ?? ""}`} />
  );
}

/** Bloco de imagem + texto, com o lado da imagem alternando. */
function Feature({ media, icon, title, text, more, reverse }: { media: ReactNode; icon: ReactNode; title: string; text: string; more: string; reverse?: boolean }) {
  return (
    <div className={`grid items-center gap-8 md:grid-cols-2 ${reverse ? "md:[&>*:first-child]:order-2" : ""}`}>
      <div className="aspect-[4/3] overflow-hidden rounded-[28px] shadow-[var(--shadow)]">{media}</div>
      <div>
        <span aria-hidden className="tile mb-4 bg-accent-soft text-accent">{icon}</span>
        <h3 className="font-display text-[30px] leading-tight sm:text-[36px]">{title}</h3>
        <p className="mt-3 text-lg leading-relaxed text-ink-2">{text}</p>
        <details className="group mt-4">
          <summary className="btn btn-line inline-flex w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            Saiba mais <ChevronDown strokeWidth={1.8} className="size-4 transition-transform group-open:rotate-180" />
          </summary>
          <p className="mt-3 leading-relaxed text-ink-2">{more}</p>
        </details>
      </div>
    </div>
  );
}

export default async function HomePage() {
  const { content: c, units, team, numbers: n } = await load();
  const specialties = ["coluna", "ombros", "joelhos", "posop", "mobilidade"] as const;

  return (
    <div className="site">
      <SiteHeader />
      <main id="conteudo" tabIndex={-1} className="outline-none">
        {/* 1. Abertura */}
        <section id="inicio" aria-labelledby="inicio-t" className="site-section mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6 sm:pt-10">
          <div className="hero card grid items-center gap-6 overflow-hidden p-6 sm:p-10 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div className="order-2 md:order-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent"><Sparkles className="size-4" />Fisioterapia em Recife</span>
              <h1 id="inicio-t" className="mt-4 font-display text-[40px] leading-[1.02] sm:text-[56px]">{c["hero.titulo"]}</h1>
              <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-2">{c["hero.texto"]}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={AGENDAR} className="btn btn-brand min-h-12 px-6 text-base">Agendar tratamento</Link>
                <a href="#clinica" className="btn btn-line min-h-12 px-6 text-base">Conheça a clínica</a>
              </div>
            </div>
            <HeroArt className="order-1 mx-auto w-full max-w-md md:order-2" />
          </div>
        </section>

        {/* 2. A clínica */}
        <Section id="clinica" eyebrow="A clínica">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <ClinicArt className="w-full" />
            <div>
              <h2 id="clinica-t" className="font-display text-[34px] leading-tight sm:text-[44px]">{c["clinica.titulo"]}</h2>
              <p className="mt-4 text-lg leading-relaxed text-ink-2">{c["clinica.p1"]}</p>
              <p className="mt-3 text-lg leading-relaxed text-ink-2">{c["clinica.p2"]}</p>
            </div>
          </div>
        </Section>

        {/* 3. Números (do cadastro, nada inventado) */}
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <dl aria-label="A clínica em números" className="band card grid grid-cols-2 gap-6 rounded-[28px] p-6 sm:p-10 lg:grid-cols-4">
            {[
              [String(n.units), n.units === 1 ? "unidade em Recife" : "unidades em Recife"],
              [String(n.physios), "fisioterapeutas"],
              [`${n.sessions} sessões`, `${n.perWeek} por semana, em média`],
              [`${n.openHour}h–${n.closeHour}h`, n.saturday ? "de segunda a sábado" : "de segunda a sexta"],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="sr-only">{label}</dt>
                <dd className="band-num font-display text-[40px] leading-none tabular-nums sm:text-[52px]">{value}</dd>
                <dd className="mt-2 text-sm text-ink-2">{label}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* 4. Especialidades */}
        <Section id="especialidades" eyebrow="Especialidades" title="Onde a fisioterapia pode ajudar">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {specialties.map((s) => {
              const Art = SPECIALTY_ART[s];
              return (
                <li key={s} className="card flex flex-col p-6">
                  <Art className="size-20" />
                  <h3 className="mt-4 text-xl font-semibold">{c[`esp.${s}.titulo`]}</h3>
                  <p className="mt-2 text-ink-2">{c[`esp.${s}.texto`]}</p>
                  <details className="group mt-auto pt-4">
                    <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-semibold text-accent [&::-webkit-details-marker]:hidden">
                      Saiba mais <ChevronDown strokeWidth={1.8} className="size-4 transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="mt-1 text-sm leading-relaxed text-ink-2">{c[`esp.${s}.mais`]}</p>
                  </details>
                </li>
              );
            })}
          </ul>
        </Section>

        {/* 5. Nosso espaço / A terapia ideal */}
        <Section id="espaco" eyebrow="Nosso espaço" className="flex flex-col gap-16">
          <Feature title={c["espaco.titulo"]} text={c["espaco.texto"]} more={c["espaco.mais"]} icon={<Home />}
            media={<Photo name="espaco" sizes="(min-width: 768px) 560px, 100vw" alt="Sala de fisioterapia com aparelhos de exercício (remo, bicicleta e cadeiras de treino) diante de grandes janelas" />} />
          <Feature reverse title={c["terapia.titulo"]} text={c["terapia.texto"]} more={c["terapia.mais"]} icon={<Dumbbell />}
            media={<Photo name="exercicios" sizes="(min-width: 768px) 560px, 100vw" alt="Materiais de exercício terapêutico: halteres leves, faixa elástica com alças e bola" />} />
        </Section>

        {/* 6. Como funciona */}
        <Section id="como-funciona" eyebrow="Como funciona" title="Do primeiro dia à alta">
          <ol className="grid gap-4 md:grid-cols-5">
            {[1, 2, 3, 4, 5].map((i) => (
              <li key={i} className="card relative p-5">
                <span className="flex size-10 items-center justify-center rounded-full bg-accent-fill font-semibold text-on-accent">{i}</span>
                <h3 className="mt-3 font-semibold">{c[`passos.${i}.titulo`]}</h3>
                <p className="mt-1 text-sm text-ink-2">{c[`passos.${i}.texto`]}</p>
              </li>
            ))}
          </ol>
          <p className="notice mt-6 flex items-start gap-3 rounded-2xl p-4 text-base">
            <HeartHandshake strokeWidth={1.8} aria-hidden className="mt-0.5 size-5 shrink-0" />{c["passos.nota"]}
          </p>
        </Section>

        {/* 7. Equipe */}
        <Section id="equipe" eyebrow="Equipe" title="Quem cuida de você">
          {!team.length ? <p className="text-ink-2">A equipe aparece aqui em instantes.</p> : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {team.map((p) => (
                <li key={p.name} className="card flex items-start gap-4 p-5">
                  <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent-fill text-lg font-semibold text-on-accent">{initials(p.name)}</span>
                  <div>
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-sm text-ink-3">Fisioterapeuta · {p.unit}</p>
                    {p.intro && <p className="mt-1 text-sm text-ink-2">{p.intro}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-ink-3">Nomes fictícios de demonstração.</p>
        </Section>

        {/* 8. Unidades */}
        <Section id="unidades" eyebrow="Unidades" title="Perto de você">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <ul className="flex flex-col gap-4">
              {units.map((u) => (
                <li key={u.id} className="card p-6">
                  <h3 className="font-display text-[28px] leading-tight">{u.name}</h3>
                  <ul className="mt-3 flex flex-col gap-2 text-ink-2">
                    <li className="flex gap-2"><MapPin strokeWidth={1.8} aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" /><span>{u.address}<span className="block text-xs text-ink-3">{NOTA_ENDERECO}</span></span></li>
                    <li className="flex gap-2"><Clock strokeWidth={1.8} aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />Seg a sex, {u.openHour}h às {u.closeHour}h{u.saturdayEnabled ? ` · Sáb, ${u.satOpenHour}h às ${u.satCloseHour}h` : ""}</li>
                    <li className="flex gap-2"><Phone strokeWidth={1.8} aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />{u.phone} <span className="text-xs text-ink-3">(fictício)</span></li>
                  </ul>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${u.lat},${u.lng}`} target="_blank" rel="noreferrer" className="btn btn-line flex-1"><Navigation strokeWidth={1.6} className="size-4" />Google Maps</a>
                    <a href={`https://waze.com/ul?ll=${u.lat},${u.lng}&navigate=yes`} target="_blank" rel="noreferrer" className="btn btn-line flex-1">Waze</a>
                  </div>
                </li>
              ))}
            </ul>
            {!!units.length && <LazyMap units={units.map((u) => ({ id: u.id, name: u.name, lat: u.lat, lng: u.lng }))} />}
          </div>
        </Section>

        {/* 9. Convênios e pagamento */}
        <Section id="convenios" eyebrow="Convênios e pagamento" title="Como você paga">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="card p-6">
              <span aria-hidden className="tile mb-3 bg-info-soft text-info"><ShieldCheck /></span>
              <h3 className="text-xl font-semibold">Convênio</h3>
              <p className="mt-2 text-ink-2">{c["convenios.texto"]}</p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {lines(c["convenios.lista"]).map((x) => <li key={x} className="rounded-full bg-surface-2 px-3 py-1.5 text-sm font-medium">{x}</li>)}
              </ul>
              <p className="mt-3 text-xs text-ink-3">Convênios fictícios de demonstração.</p>
            </div>
            <div className="card p-6">
              <span aria-hidden className="tile mb-3 bg-ok-soft text-ok"><Wallet /></span>
              <h3 className="text-xl font-semibold">Particular</h3>
              <p className="mt-2 text-ink-2">{c["pagamento.texto"]}</p>
            </div>
          </div>
        </Section>

        {/* 10. Perguntas frequentes */}
        <Section id="faq" eyebrow="Dúvidas" title="Perguntas frequentes">
          <div className="card divide-y divide-line">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <details key={i} className="group px-5 sm:px-6">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
                  {c[`faq.${i}.q`]}<ChevronDown strokeWidth={1.8} aria-hidden className="size-5 shrink-0 text-accent transition-transform group-open:rotate-180" />
                </summary>
                <p className="pb-4 leading-relaxed text-ink-2">{c[`faq.${i}.a`]}</p>
              </details>
            ))}
          </div>
        </Section>

        {/* 11. Contato */}
        <Section id="contato">
          <div className="hero card grid items-center gap-6 p-6 sm:p-10 md:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <h2 id="contato-t" className="font-display text-[34px] leading-tight sm:text-[44px]">{c["contato.titulo"]}</h2>
              <p className="mt-3 max-w-xl text-lg text-ink-2">{c["contato.texto"]}</p>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {units.map((u) => (
                  <li key={u.id} className="text-sm">
                    <p className="font-semibold">{u.name}</p>
                    <p className="flex items-center gap-1.5"><Phone strokeWidth={1.8} aria-hidden className="size-4" />{u.phone}</p>
                    {u.email && <p className="flex items-center gap-1.5"><Mail strokeWidth={1.8} aria-hidden className="size-4" />{u.email}</p>}
                  </li>
                ))}
              </ul>
            </div>
            <Link href={AGENDAR} className="btn btn-brand min-h-12 px-6 text-base"><CalendarCheck strokeWidth={1.8} className="size-5" />Entrar para agendar</Link>
          </div>
        </Section>
      </main>

      {/* 12. Rodapé */}
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6">
          <div>
            <p className="font-display text-2xl">Movimento</p>
            <p className="mt-2 text-sm text-ink-2">Fisioterapia do primeiro dia à alta.</p>
          </div>
          <nav aria-label="Rodapé">
            <ul className="grid grid-cols-2 gap-1 text-sm">
              {[["#clinica", "A clínica"], ["#especialidades", "Especialidades"], ["#unidades", "Unidades"], ["#faq", "Perguntas"], ["/login", "Entrar"], ["/cadastro", "Criar conta"]].map(([href, label]) => (
                <li key={href}><a href={href} className="inline-flex min-h-10 items-center text-ink-2 hover:text-ink">{label}</a></li>
              ))}
            </ul>
          </nav>
          <div className="text-sm text-ink-2">
            {units.map((u) => <p key={u.id} className="flex items-center gap-1.5"><Stethoscope strokeWidth={1.8} aria-hidden className="size-4 text-accent" />{u.name}</p>)}
            <p className="mt-1 flex items-center gap-1.5"><Users strokeWidth={1.8} aria-hidden className="size-4 text-accent" />{n.physios} fisioterapeutas</p>
          </div>
        </div>
        <p className="border-t border-line px-4 py-4 text-center text-xs text-ink-3">Clínica fictícia. Conteúdo ilustrativo de demonstração. Não use dados pessoais reais.</p>
      </footer>
    </div>
  );
}
