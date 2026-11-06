/**
 * Arte da página pública feita para este projeto: traço fino, sem pessoas, só tokens de cor (acompanha os dois temas).
 * Decorativa: o texto ao lado diz o que importa.
 */
import { Bone, Dumbbell, Footprints, Move, ShieldPlus, type LucideIcon } from "lucide-react";

/** A clínica em linha única: janela, maca, bola, faixa elástica e planta. */
export function ClinicLine({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 560 400" className={className} aria-hidden fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="558" height="398" rx="32" fill="var(--surface-2)" />
      <g stroke="var(--ink-3)" strokeWidth="1.6">
        {/* Janela com persiana */}
        <rect x="64" y="56" width="168" height="136" rx="10" />
        <path d="M148 56v136M64 124h168" />
        <path d="M76 74h60M76 86h60M76 98h60M160 74h60M160 86h60M160 98h60" opacity=".5" />
        {/* Prateleira com rolos e halteres */}
        <path d="M300 92h176M300 150h176" />
        <circle cx="330" cy="76" r="14" /><circle cx="366" cy="76" r="14" />
        <path d="M410 134h40M404 128v12M456 128v12" />
        {/* Chão */}
        <path d="M40 330h480" opacity=".6" />
      </g>
      <g stroke="var(--accent)" strokeWidth="2">
        {/* Maca */}
        <path d="M96 262h208c10 0 16-6 16-14v-6H96zM120 262v68M296 262v68M108 330h24M284 330h24M96 242c-12 0-18-8-18-18" />
        {/* Bola de exercício */}
        <circle cx="400" cy="282" r="48" />
        <path d="M356 268c28 14 60 14 88 0" opacity=".6" />
        {/* Faixa elástica pendurada */}
        <path d="M486 150c-10 40-6 90 6 128" />
      </g>
      {/* Planta */}
      <g stroke="var(--brand)" strokeWidth="2">
        <path d="M480 330v-34M480 300c-4-26-22-36-34-38M480 290c6-22 22-30 32-30" />
        <path d="M466 330h28l-4-22h-20z" />
      </g>
    </svg>
  );
}

/** Ícones de traço consistentes por especialidade (mesma espessura em todos). */
export const SPECIALTY_ICON: Record<string, LucideIcon> = {
  coluna: Bone,
  ombros: Dumbbell,
  joelhos: Footprints,
  posop: ShieldPlus,
  mobilidade: Move,
};
