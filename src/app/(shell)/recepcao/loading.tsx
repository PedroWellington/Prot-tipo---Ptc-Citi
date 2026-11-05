import { AgendaSkeleton } from "@/components/skeletons";

// Mesmo formato da tela final; o shell (sidebar e topo) continua na tela
export default function Loading() {
  return <AgendaSkeleton desk />;
}
