import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Instrument_Serif } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { ScrollProgress } from "@/components/scroll-progress";
import { DEMO_MODE } from "@/lib/demo";
import { THEME_SCRIPT } from "@/lib/theme";
import "@/styles/globals.css";

const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument-sans", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-instrument-serif", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Movimento", template: "%s · Movimento" },
  description: "Acompanhe seu tratamento de fisioterapia na Clínica Movimento.",
  appleWebApp: { capable: true, title: "Movimento", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1613" },
  ],
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
        {DEMO_MODE && <p role="note" className="demo-banner">Ambiente de demonstração — dados fictícios, não use CPF real</p>}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
