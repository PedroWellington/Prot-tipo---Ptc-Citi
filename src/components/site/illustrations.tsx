/**
 * Ilustrações SVG originais da página pública (feitas para este projeto, sem base em imagens de terceiros).
 * Só usam tokens de cor, então acompanham os temas claro e escuro. Decorativas: o texto ao lado diz o que importa.
 */
import type { ReactNode } from "react";

const Svg = ({ viewBox, className, children }: { viewBox: string; className?: string; children: ReactNode }) => (
  <svg viewBox={viewBox} className={className} aria-hidden fill="none" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

/** Abertura: sala clara com janela, planta, colchonete e uma figura alongando o tronco ao lado da bola. */
export function HeroArt({ className }: { className?: string }) {
  return (
    <Svg viewBox="0 0 480 400" className={className}>
      <rect x="20" y="20" width="440" height="360" rx="36" fill="var(--surface)" opacity=".9" />
      <rect x="60" y="56" width="150" height="120" rx="14" fill="var(--accent-soft)" stroke="var(--line-strong)" strokeWidth="3" />
      <path d="M135 56v120M60 116h150" stroke="var(--line-strong)" strokeWidth="3" />
      <circle cx="98" cy="88" r="14" fill="var(--chart-3)" opacity=".55" />
      <path d="M400 300c0-40 6-70 22-96M400 300c-6-34-26-54-48-62M400 300c4-26 22-40 42-44" stroke="var(--brand)" strokeWidth="6" />
      <path d="M378 300h44l-6 40h-32z" fill="var(--chart-2)" opacity=".85" />
      <rect x="70" y="318" width="250" height="16" rx="8" fill="var(--brand)" opacity=".7" />
      <circle cx="320" cy="282" r="36" fill="var(--chart-2)" opacity=".25" stroke="var(--chart-2)" strokeWidth="4" />
      {/* Figura: ajoelhada no colchonete, braço estendido acima da cabeça (alongamento lateral) */}
      <circle cx="196" cy="168" r="18" fill="var(--ink)" />
      <path d="M196 188c-4 36-6 64-2 96" stroke="var(--ink)" strokeWidth="14" />
      <path d="M194 210c26-22 44-50 52-86" stroke="var(--ink)" strokeWidth="10" />
      <path d="M196 214c-20 14-34 30-40 50" stroke="var(--ink)" strokeWidth="10" />
      <path d="M194 284l-50 28h-28M196 284l40 14 6 20" stroke="var(--ink)" strokeWidth="12" />
      <path d="M248 120c18-8 30 4 28 18" stroke="var(--brand)" strokeWidth="4" strokeDasharray="6 8" />
    </Svg>
  );
}

/** A clínica: recepção acolhedora, balcão, cadeira e quadro de horários. */
export function ClinicArt({ className }: { className?: string }) {
  return (
    <Svg viewBox="0 0 480 360" className={className}>
      <rect x="16" y="16" width="448" height="328" rx="32" fill="var(--accent-soft)" />
      <rect x="56" y="64" width="160" height="104" rx="12" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="3" />
      {[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => (
        <rect key={`${r}${c}`} x={70 + c * 36} y={78 + r * 28} width="26" height="18" rx="4" fill={(r + c) % 3 ? "var(--surface-2)" : "var(--brand)"} opacity={(r + c) % 3 ? 1 : 0.7} />
      )))}
      <rect x="240" y="196" width="196" height="96" rx="14" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="3" />
      <rect x="240" y="196" width="196" height="18" rx="9" fill="var(--chart-2)" opacity=".8" />
      <circle cx="330" cy="150" r="22" fill="var(--ink)" opacity=".85" />
      <path d="M302 196c4-18 14-26 28-26s24 8 28 26" fill="var(--ink)" opacity=".85" />
      <path d="M90 300v-60h70v60M84 240h82" stroke="var(--ink-2)" strokeWidth="8" />
      <path d="M392 120c0-26 4-46 16-62M392 120c-6-20-18-30-32-34" stroke="var(--brand)" strokeWidth="6" />
      <path d="M376 120h32l-4 30h-24z" fill="var(--chart-3)" opacity=".8" />
    </Svg>
  );
}

const icon = (paths: ReactNode) => function Icon({ className }: { className?: string }) {
  return <Svg viewBox="0 0 96 96" className={className}><circle cx="48" cy="48" r="44" fill="var(--accent-soft)" />{paths}</Svg>;
};

export const SPECIALTY_ART: Record<string, (p: { className?: string }) => ReactNode> = {
  // Coluna: vértebras empilhadas com a curva natural
  coluna: icon(<>{[22, 32, 42, 52, 62, 72].map((y, i) => <rect key={y} x={40 + Math.sin(i / 1.6) * 5} y={y} width="16" height="7" rx="3.5" fill="var(--brand)" />)}<path d="M36 18c-6 24 6 40 0 62" stroke="var(--chart-2)" strokeWidth="3" /></>),
  // Ombro: braço elevado com seta de amplitude
  ombros: icon(<><circle cx="44" cy="30" r="8" fill="var(--ink)" /><path d="M44 40v26M44 46l18-16M44 46l-12 14" stroke="var(--ink)" strokeWidth="6" /><path d="M66 22a20 20 0 0 1 8 24" stroke="var(--brand)" strokeWidth="4" /><path d="M74 46l2-8-7 3" fill="var(--brand)" /></>),
  // Joelho: perna flexionada sobre uma faixa elástica
  joelhos: icon(<><path d="M30 26l14 26-8 22M44 52h24" stroke="var(--ink)" strokeWidth="7" /><circle cx="44" cy="52" r="7" fill="var(--brand)" /><path d="M26 76h44" stroke="var(--chart-2)" strokeWidth="4" /></>),
  // Pós-operatório: cruz suave e linha de evolução subindo
  posop: icon(<><rect x="40" y="20" width="16" height="40" rx="5" fill="var(--brand)" /><rect x="28" y="32" width="40" height="16" rx="5" fill="var(--brand)" /><path d="M24 76l14-8 12 4 20-12" stroke="var(--chart-2)" strokeWidth="4" /></>),
  // Mobilidade: figura em passada com setas de movimento
  mobilidade: icon(<><circle cx="52" cy="24" r="7" fill="var(--ink)" /><path d="M50 32l-4 20 12 10 2 16M46 52l-12 14M48 38l14 8M48 38l-14 6" stroke="var(--ink)" strokeWidth="5" /><path d="M20 30h10M16 42h12" stroke="var(--brand)" strokeWidth="4" /></>),
};
