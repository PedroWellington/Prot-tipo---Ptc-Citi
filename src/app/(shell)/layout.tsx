import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { Onboarding } from "@/components/onboarding";
import { currentUser } from "@/server/auth/session";

// Um layout só para todas as áreas: sidebar e topo nunca remontam, nem do admin para a recepção
export default async function ShellLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <AppShell role={user.role} name={user.name}>
      {user.role === "PACIENTE" && !user.onboardedAt && <Onboarding />}
      {children}
    </AppShell>
  );
}
