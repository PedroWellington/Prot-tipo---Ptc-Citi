import type { ReactNode } from "react";
import { Providers } from "@/components/providers";

// Esta tela usa React Query e avisos; o layout raiz não carrega isso para todas as páginas
export default function Layout({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>;
}
