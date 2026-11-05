import {
  Activity, ArrowRight, ArrowUp, CalendarCheck, CalendarHeart, ClipboardCheck, Clock, Dumbbell, HandHeart, HeartHandshake, Home, Mail, MapPin,
  Navigation, Phone, ShieldCheck, Sparkles, Stethoscope, UserRound, Wallet, type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Faq } from "@/components/site/faq";
import { SiteHeader } from "@/components/site/header";
import { ClinicLine, SPECIALTY_ICON } from "@/components/site/illustrations";
import { LazyMap } from "@/components/site/lazy-map";
import { Marquee, type MarqueeItem } from "@/components/site/marquee";
import { HeroMockup } from "@/components/site/mockup";
import { MOTION_SCRIPT, SiteMotion } from "@/components/site/motion";
import { lines, mergeContent } from "@/lib/site-content";
import { SITE_IMAGES } from "@/lib/site-images";
import { NOTA_ENDERECO } from "@/lib/unidades";
import { siteData, type SiteData } from "@/server/services/site";

// Abaixo da dobra: o código das abas vem num pedaço separado
const ProductTour = dynamic(() => import("@/components/site/product-tour"));

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
const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

/** Rótulo em caixa-alta, título forte e subtítulo curto, sempre no mesmo alinhamento. */
function Heading({ id, eyebrow, title, sub, center }: { id: string; eyebrow: string; title: string; sub?: string; center?: boolean }) {
  return (
    <div data-reveal className={`mb-10 max-w-2xl ${center ? "mx-auto text-center" : ""}`}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={`${id}-t`} className="mt-2 font-display text-[36px] leading-[1.05] sm:text-[48px]">{title}</h2>
      {sub && <p className="mt-3 text-lg leading-relaxed text-ink-2">{sub}</p>}
    </div>
  );
}

function Section({ id, children, className, band }: { id: string; children: ReactNode; className?: string; band?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className={`site-section ${band ?? ""}`}>
      <div className={`mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24 ${className ?? ""}`}>{children}</div>
    </section>
  );
}

/** Curva suave entre bandas, pintada na cor da banda de baixo. */
const Edge = ({ fill, flip }: { fill: string; flip?: boolean }) => (
  <svg aria-hidden viewBox="0 0 1440 64" preserveAspectRatio="none" className="band-edge" style={flip ? { transform: "scaleY(-1)" } : undefined}>
    <path d="M0 64V40C240 8 480 0 720 12s480 40 720 20v32z" fill={fill} />
  </svg>
);

function Photo({ name, alt, sizes }: { name: keyof typeof SITE_IMAGES; alt: string; sizes: string }) {
  const img = SITE_IMAGES[name];
  return (
    <Image src={`/site/${name}-{w}.webp`} alt={alt} width={img.width} height={img.height} sizes={sizes} placeholder="blur" blurDataURL={img.blur}
      loading="lazy" className="h-full w-full object-cover" />
  );
}

/** Imagem + texto, com o lado da imagem alternando. */
function Feature({ media, icon, title, text, more, reverse }: { media: ReactNode; icon: ReactNode; title: string; text: string; more: string; reverse?: boolean }) {
  return (
    <div className="grid items-center gap-8 md:grid-cols-12 md:gap-12">
      <div data-reveal className={`aspect-[4/3] overflow-hidden rounded-[28px] shadow-[var(--shadow)] md:col-span-6 ${reverse ? "md:order-2" : ""}`}>{media}</div>
      <div data-reveal className="md:col-span-6">
        <span aria-hidden className="tile mb-4 bg-accent-soft text-accent">{icon}</span>
        <h3 className="font-display text-[30px] leading-tight sm:text-[38px]">{title}</h3>
        <p className="mt-3 text-lg leading-relaxed text-ink-2">{text}</p>
        <p className="mt-3 leading-relaxed text-ink-2">{more}</p>
      </div>
    </div>
  );
}

const STRIP_ICONS: LucideIcon[] = [Activity, Dumbbell, HandHeart, ShieldCheck, Sparkles, HeartHandshake, Home, ClipboardCheck, CalendarHeart];

export default async function HomePage() {
  const { content: c, units, team, numbers: n } = await load();
  const specialties = ["coluna", "ombros", "joelhos", "posop", "mobilidade"] as const;

  // Faixa 1: equipe lida do banco (nomes fictícios). Faixa 2: lista editável em Admin > Textos
  const teamStrip: MarqueeItem[] = team.map((p) => ({ key: p.name, icon: UserRound, title: p.name, detail: `Fisioterapeuta · ${p.unit}` }));
  const careStrip: MarqueeItem[] = lines(c["faixa.especialidades"]).map((x, i) => ({ key: x, icon: STRIP_ICONS[i % STRIP_ICONS.length], title: x }));

  // Números do próprio cadastro; o valor final já vem no HTML (sem JS a contagem não roda e nada some)
  const stats: { value: number; prefix?: string; suffix?: string; label: string }[] = [
    { value: n.units, label: n.units === 1 ? "unidade em Recife" : "unidades em Recife" },
    { value: n.physios, label: "fisioterapeutas" },
    { value: n.sessions, suffix: " sessões", label: `${n.perWeek} por semana, em média` },
    { value: n.closeHour, prefix: `${n.openHour}h–`, suffix: "h", label: n.saturday ? "de segunda a sábado" : "de segunda a sexta" },
  ];

  const tour = [
    { id: "paciente", label: "Paciente", screen: "paciente-desktop", phone: "paciente-celular", alt: "Painel do paciente: progresso, próxima sessão, fases e exercícios", points: lines(c["tour.paciente"]) },
    { id: "recepcao", label: "Recepção", screen: "recepcao-desktop", alt: "Agenda da recepção com as sessões do dia por fisioterapeuta", points: lines(c["tour.recepcao"]) },
    { id: "fisio", label: "Fisioterapeuta", screen: "fisio-desktop", alt: "Agenda da fisioterapeuta com botões para marcar a sessão como realizada", points: lines(c["tour.fisio"]) },
  ] as const;

  return (
    <div className="site">
      {/* Antes da primeira pintura: decide se o conteúdo entra animado (com JS e sem "menos movimento") */}
      <script dangerouslySetInnerHTML={{ __html: MOTION_SCRIPT }} />
      <span data-top-sentinel aria-hidden className="absolute top-0 left-0 h-px w-px" />
      <SiteHeader />
      <SiteMotion />
      <main id="conteudo" tabIndex={-1} className="outline-none">
        {/* 1. Abertura: banda escura com o mockup do próprio sistema */}
        <section id="inicio" aria-labelledby="inicio-t" className="site-section site-dark overflow-hidden">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-12 pb-10 sm:px-6 sm:pt-20 lg:grid-cols-12">
            <div className="hero-seq lg:col-span-6">
              <span style={stagger(0)} className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent"><Sparkles className="size-4" />Fisioterapia em Recife</span>
              <h1 id="inicio-t" style={stagger(1)} className="hero-lcp mt-5 font-display text-[44px] leading-[1.02] sm:text-[60px]">{c["hero.titulo"]}</h1>
              <p style={stagger(2)} className="hero-lcp mt-5 max-w-xl text-lg leading-relaxed text-ink-2">{c["hero.texto"]}</p>
              <div style={stagger(3)} className="mt-8 flex flex-wrap gap-3">
                <Link href={AGENDAR} prefetch={false} className="btn btn-brand min-h-12 px-6 text-base">Agendar tratamento<ArrowRight strokeWidth={2} className="btn-arrow size-4" /></Link>
                <a href="#sistema" className="btn btn-line min-h-12 px-6 text-base">Ver o sistema</a>
              </div>
            </div>
            <div className="hero-seq lg:col-span-6">
              <div style={stagger(4)}><HeroMockup /></div>
            </div>
          </div>
          {/* Faixa 1: equipe */}
          <div className="mx-auto max-w-6xl px-4 pb-6 sm:px-6">
            <Marquee items={teamStrip} label="Equipe de fisioterapeutas" seconds={48} />
          </div>
          <Edge fill="var(--page-bg)" />
        </section>

        {/* 2. A clínica */}
        <Section id="clinica">
          <div className="grid items-center gap-10 md:grid-cols-12 md:gap-14">
            <div data-reveal className="md:col-span-6"><ClinicLine className="w-full" /></div>
            <div data-reveal className="md:col-span-6">
              <p className="eyebrow">A clínica</p>
              <h2 id="clinica-t" className="mt-2 font-display text-[36px] leading-[1.05] sm:text-[48px]">{c["clinica.titulo"]}</h2>
              <p className="mt-4 text-lg leading-relaxed text-ink-2">{c["clinica.p1"]}</p>
              <p className="mt-3 text-lg leading-relaxed text-ink-2">{c["clinica.p2"]}</p>
            </div>
          </div>
        </Section>

        {/* 3. Indicadores, em cor forte (do cadastro; nada inventado) */}
        <div className="site-strong">
          <dl data-reveal aria-label="A clínica em números" className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-8 px-4 py-14 sm:px-6 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="sr-only">{s.label}</dt>
                <dd className="font-display text-[44px] leading-none tabular-nums sm:text-[56px]">{s.prefix}<span data-count={s.value}>{s.value}</span>{s.suffix}</dd>
                <dd className="mt-2 text-sm font-medium">{s.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* 4. Especialidades */}
        <Section id="especialidades" band="site-alt">
          <Heading id="especialidades" eyebrow="Especialidades" title="Onde a fisioterapia pode ajudar" sub={c["sub.especialidades"]} />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {specialties.map((s, i) => {
              const Icon = SPECIALTY_ICON[s];
              return (
                <li key={s} data-reveal="card" style={stagger(i)}>
                  <article className="lift card flex h-full flex-col p-6">
                    <span aria-hidden className="tile bg-accent-soft text-accent"><Icon strokeWidth={1.6} /></span>
                    <h3 className="mt-4 text-xl font-semibold">{c[`esp.${s}.titulo`]}</h3>
                    <p className="mt-2 text-ink-2">{c[`esp.${s}.texto`]}</p>
                    <p className="mt-3 text-sm leading-relaxed text-ink-3">{c[`esp.${s}.mais`]}</p>
                  </article>
                </li>
              );
            })}
          </ul>
        </Section>

        {/* 5. Nosso espaço / A terapia ideal */}
        <Section id="espaco" className="flex flex-col gap-16">
          <h2 id="espaco-t" className="sr-only">Nosso espaço</h2>
          <Feature title={c["espaco.titulo"]} text={c["espaco.texto"]} more={c["espaco.mais"]} icon={<Home />}
            media={<Photo name="espaco" sizes="(min-width: 768px) 540px, 100vw" alt="Sala de fisioterapia com aparelhos de exercício (remo, bicicleta e cadeiras de treino) diante de grandes janelas" />} />
          <Feature reverse title={c["terapia.titulo"]} text={c["terapia.texto"]} more={c["terapia.mais"]} icon={<Dumbbell />}
            media={<Photo name="exercicios" sizes="(min-width: 768px) 540px, 100vw" alt="Materiais de exercício terapêutico: halteres leves, faixa elástica com alças e bola" />} />
        </Section>

        {/* 6. Como funciona: passos numerados e linha que se desenha */}
        <Section id="como-funciona" band="site-alt">
          <Heading id="como-funciona" eyebrow="Como funciona" title="Do primeiro dia à alta" sub={c["sub.como"]} />
          <div className="relative">
            <svg aria-hidden className="steps-line absolute top-5 right-[10%] left-[10%] hidden h-1 md:block" viewBox="0 0 100 2" preserveAspectRatio="none">
              <line x1="0" y1="1" x2="100" y2="1" pathLength={1} stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </svg>
            <svg aria-hidden className="steps-line absolute top-5 bottom-5 left-5 w-1 md:hidden" viewBox="0 0 2 100" preserveAspectRatio="none">
              <line x1="1" y1="0" x2="1" y2="100" pathLength={1} stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </svg>
            <ol className="relative grid gap-6 md:grid-cols-5">
              {[1, 2, 3, 4, 5].map((i) => (
                <li key={i} data-reveal="card" style={stagger(i - 1)} className="flex gap-4 md:flex-col md:items-center md:text-center">
                  <span className="relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-fill font-semibold text-on-accent ring-4 ring-[var(--alt-bg)]">{i}</span>
                  <div className="lift card w-full p-5">
                    <h3 className="font-semibold">{c[`passos.${i}.titulo`]}</h3>
                    <p className="mt-1 text-sm text-ink-2">{c[`passos.${i}.texto`]}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <p data-reveal className="notice mt-8 flex items-start gap-3 rounded-2xl p-4 text-base">
            <HeartHandshake strokeWidth={1.8} aria-hidden className="mt-0.5 size-5 shrink-0" />{c["passos.nota"]}
          </p>
        </Section>

        {/* 7. Veja o sistema por dentro (banda escura) */}
        <section id="sistema" aria-labelledby="sistema-t" className="site-section site-dark overflow-x-clip">
          <Edge fill="var(--alt-bg)" flip />
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <Heading id="sistema" eyebrow="O sistema" title={c["tour.titulo"]} sub={c["tour.sub"]} />
            <div data-reveal><ProductTour tabs={tour.map((t) => ({ ...t }))} /></div>
          </div>
          <Edge fill="var(--page-bg)" />
        </section>

        {/* 8. Equipe */}
        <Section id="equipe">
          <Heading id="equipe" eyebrow="Equipe" title="Quem cuida de você" sub={c["sub.equipe"]} />
          {!team.length ? <p className="text-ink-2">A equipe aparece aqui em instantes.</p> : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {team.map((p, i) => (
                <li key={p.name} data-reveal="card" style={stagger(i)}>
                  <article className="lift card flex h-full items-start gap-4 p-5">
                    <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent-fill text-lg font-semibold text-on-accent">{initials(p.name)}</span>
                    <div>
                      <h3 className="font-semibold">{p.name}</h3>
                      <p className="text-sm text-ink-3">Fisioterapeuta · {p.unit}</p>
                      {p.intro && <p className="mt-1 text-sm text-ink-2">{p.intro}</p>}
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-ink-3">Nomes fictícios de demonstração.</p>
        </Section>

        {/* 9. Unidades */}
        <Section id="unidades" band="site-alt">
          <Heading id="unidades" eyebrow="Unidades" title="Perto de você" sub={c["sub.unidades"]} />
          <div className="grid gap-6 lg:grid-cols-12">
            <ul className="flex flex-col gap-4 lg:col-span-6">
              {units.map((u, i) => (
                <li key={u.id} data-reveal="card" style={stagger(i)}>
                  <article className="lift card p-6">
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
                  </article>
                </li>
              ))}
            </ul>
            {!!units.length && <div data-reveal className="lg:col-span-6"><LazyMap units={units.map((u) => ({ id: u.id, name: u.name, lat: u.lat, lng: u.lng }))} /></div>}
          </div>
        </Section>

        {/* 10. Convênios e pagamento */}
        <Section id="convenios">
          <Heading id="convenios" eyebrow="Convênios e pagamento" title="Como você paga" sub={c["sub.convenios"]} />
          <div className="grid gap-4 md:grid-cols-2">
            <div data-reveal="card" style={stagger(0)}>
              <article className="lift card h-full p-6">
                <span aria-hidden className="tile mb-3 bg-info-soft text-info"><ShieldCheck /></span>
                <h3 className="text-xl font-semibold">Convênio</h3>
                <p className="mt-2 text-ink-2">{c["convenios.texto"]}</p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {lines(c["convenios.lista"]).map((x) => <li key={x} className="lift rounded-full border border-line bg-surface-2 px-3 py-1.5 text-sm font-medium">{x}</li>)}
                </ul>
                <p className="mt-3 text-xs text-ink-3">Convênios fictícios de demonstração.</p>
              </article>
            </div>
            <div data-reveal="card" style={stagger(1)}>
              <article className="lift card h-full p-6">
                <span aria-hidden className="tile mb-3 bg-ok-soft text-ok"><Wallet /></span>
                <h3 className="text-xl font-semibold">Particular</h3>
                <p className="mt-2 text-ink-2">{c["pagamento.texto"]}</p>
              </article>
            </div>
          </div>
        </Section>

        {/* 11. Perguntas frequentes */}
        <Section id="faq" band="site-alt">
          <Heading id="faq" eyebrow="Dúvidas" title="Perguntas frequentes" sub={c["sub.faq"]} />
          <Faq items={[1, 2, 3, 4, 5, 6].map((i) => ({ q: c[`faq.${i}.q`], a: c[`faq.${i}.a`] }))} />
        </Section>

        {/* Faixa 2: especialidades e tratamentos, no sentido oposto */}
        <div className="site-alt pb-10">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Marquee items={careStrip} label="Especialidades e tratamentos" reverse seconds={56} />
          </div>
        </div>

        {/* 12. Fechamento escuro */}
        <section id="contato" aria-labelledby="contato-t" className="site-section site-dark">
          <Edge fill="var(--alt-bg)" flip />
          <div className="mx-auto grid w-full max-w-6xl items-center gap-8 px-4 py-16 sm:px-6 sm:py-20 md:grid-cols-12">
            <div data-reveal className="md:col-span-8">
              <p className="eyebrow">Contato</p>
              <h2 id="contato-t" className="mt-2 font-display text-[36px] leading-[1.05] sm:text-[48px]">{c["contato.titulo"]}</h2>
              <p className="mt-3 max-w-xl text-lg text-ink-2">{c["contato.texto"]}</p>
              <ul className="mt-6 grid gap-4 sm:grid-cols-2">
                {units.map((u) => (
                  <li key={u.id} className="text-sm">
                    <p className="font-semibold">{u.name}</p>
                    <p className="flex items-center gap-1.5 text-ink-2"><Phone strokeWidth={1.8} aria-hidden className="size-4" />{u.phone}</p>
                    {u.email && <p className="flex items-center gap-1.5 text-ink-2"><Mail strokeWidth={1.8} aria-hidden className="size-4" />{u.email}</p>}
                  </li>
                ))}
              </ul>
            </div>
            <div data-reveal className="md:col-span-4 md:justify-self-end">
              <Link href={AGENDAR} prefetch={false} className="btn btn-brand min-h-12 px-6 text-base"><CalendarCheck strokeWidth={1.8} className="size-5" />Entrar para agendar<ArrowRight strokeWidth={2} className="btn-arrow size-4" /></Link>
            </div>
          </div>
        </section>
      </main>

      {/* 13. Rodapé em colunas */}
      <footer className="site-dark border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <p className="font-display text-3xl">Movimento</p>
            <p className="mt-2 text-sm text-ink-2">Fisioterapia do primeiro dia à alta, em Boa Viagem e Casa Forte.</p>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-2"><Stethoscope strokeWidth={1.8} aria-hidden className="size-4 text-accent" />{n.physios} fisioterapeutas</p>
          </div>
          <div className="lg:col-span-3">
            <h2 className="text-sm font-semibold tracking-wide uppercase">Unidades</h2>
            <ul className="mt-3 flex flex-col gap-3 text-sm text-ink-2">
              {units.map((u) => <li key={u.id}><span className="font-medium text-ink">{u.name}</span><span className="block">{u.address}</span></li>)}
            </ul>
          </div>
          <nav aria-label="Rodapé" className="lg:col-span-2">
            <h2 className="text-sm font-semibold tracking-wide uppercase">Links</h2>
            <ul className="mt-3 flex flex-col text-sm">
              {[["#clinica", "A clínica"], ["#especialidades", "Especialidades"], ["#sistema", "O sistema"], ["#unidades", "Unidades"], ["#faq", "Perguntas"], ["/login", "Entrar"], ["/cadastro", "Criar conta"]].map(([href, label]) => (
                <li key={href}><a href={href} className="inline-flex min-h-10 items-center text-ink-2 hover:text-ink">{label}</a></li>
              ))}
            </ul>
          </nav>
          <div className="lg:col-span-3">
            <h2 className="text-sm font-semibold tracking-wide uppercase">Demonstração</h2>
            <p className="mt-3 text-sm text-ink-2">Clínica fictícia. Conteúdo ilustrativo de demonstração. Não use dados pessoais reais.</p>
            <a href="#inicio" className="btn btn-line mt-4 min-h-11"><ArrowUp strokeWidth={1.8} className="size-4" />Voltar ao topo</a>
          </div>
        </div>
        <p className="border-t border-line px-4 py-4 text-center text-xs text-ink-2">© Movimento · projeto de demonstração, sem vínculo com clínicas reais.</p>
      </footer>
    </div>
  );
}
