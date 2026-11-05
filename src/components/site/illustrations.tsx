/**
 * Arte da página pública feita para este projeto: traço fino, sem pessoas, só tokens de cor (acompanha os dois temas).
 * Decorativa: o texto ao lado diz o que importa.
 */
import { Bone, Dumbbell, Footprints, Move, ShieldPlus, type LucideIcon } from "lucide-react";

/** Ícones de traço consistentes por especialidade (mesma espessura em todos). */
export const SPECIALTY_ICON: Record<string, LucideIcon> = {
  coluna: Bone,
  ombros: Dumbbell,
  joelhos: Footprints,
  posop: ShieldPlus,
  mobilidade: Move,
};
