import type { Metadata } from "next";
import { MarcaMovimento } from "@/components/marca";
import { NOME_VARIANTE, VARIANTE_PADRAO, VARIANTES } from "@/lib/marca";

// Página de escolha do monograma: fora dos buscadores e sem link em menu nenhum
export const metadata: Metadata = {
  title: "Monograma: variantes",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

const TAMANHOS = [16, 32, 96];

export default function Page() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6">
      <header>
        <p className="eyebrow">Página oculta de teste</p>
        <h1 className="mt-2 font-display text-[40px] leading-tight">Monograma da Movimento</h1>
        <p className="mt-2 max-w-2xl text-ink-2">
          Três variantes do &quot;M&quot;, em fundo claro e escuro, nos tamanhos 16, 32 e 96 px. A padrão hoje é a {VARIANTE_PADRAO} ({NOME_VARIANTE[VARIANTE_PADRAO]});
          para trocar, mude <code>VARIANTE_PADRAO</code> em <code>src/lib/marca.ts</code> e rode <code>npm run icons</code>.
        </p>
      </header>
      {VARIANTES.map((v) => (
        <section key={v} aria-labelledby={`v-${v}`} className="card overflow-hidden p-0">
          <h2 id={`v-${v}`} className="px-5 pt-5 text-xl font-semibold">
            {v}: {NOME_VARIANTE[v]}{v === VARIANTE_PADRAO && <span className="ml-2 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">padrão</span>}
          </h2>
          <div className="mt-4 grid sm:grid-cols-2">
            {(["light", "dark"] as const).map((tema) => (
              <div key={tema} data-theme={tema} className="flex flex-col gap-5 bg-bg p-6 text-ink">
                <p className="text-sm text-ink-2">{tema === "light" ? "Tema claro" : "Tema escuro"}</p>
                <div className="flex items-end gap-6">
                  {TAMANHOS.map((px) => (
                    <figure key={px} className="flex flex-col items-center gap-2">
                      <MarcaMovimento variante={v} title={`Variante ${v}, ${px} px`} style={{ width: px, height: px }} />
                      <figcaption className="text-xs text-ink-3 tabular-nums">{px} px</figcaption>
                    </figure>
                  ))}
                </div>
                <span className="inline-flex items-center text-ink">
                  <MarcaMovimento variante={v} style={{ width: 29, height: 29, marginRight: -2 }} />
                  <span aria-hidden className="font-display text-[22px] leading-none">ovimento</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
