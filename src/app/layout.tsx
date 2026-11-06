import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Instrument_Serif } from "next/font/google";
import type { ReactNode } from "react";
import { ScrollProgress } from "@/components/scroll-progress";
import { THEME_SCRIPT } from "@/lib/theme";
import "@/styles/globals.css";

const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument-sans", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-instrument-serif", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Movimento", template: "%s · Movimento" },
  description: "Acompanhe seu tratamento de fisioterapia na Clínica Movimento.",
  appleWebApp: { capable: true, title: "Movimento", statusBarStyle: "black-translucent" },
  // Monograma da marca (gerado por npm run icons a partir de src/lib/marca.ts)
  icons: {
    icon: [{ url: "/icons/marca.svg", type: "image/svg+xml" }, { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: "/icons/apple-180.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#eaf7f8",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${serif.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body>
        <ScrollProgress />
        {/* React Query e avisos só entram onde são usados (área logada, cadastro, link de confirmação):
            a página pública e o login baixam menos JavaScript */}
        {children}
        {/* Portal de entrada e saída (components/portal.ts): invisível até html[data-portal]. Sem marcador estático:
            só o fundo e o canvas de partículas (decorativos); o aviso para leitor de tela fica fora do aria-hidden */}
        <div data-entry-veil aria-hidden className="entry-veil"><div className="entry-bg" /></div>
        <p data-portal-status role="status" className="sr-only" />
      </body>
    </html>
  );
}
