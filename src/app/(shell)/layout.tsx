import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { Onboarding } from "@/components/onboarding";
import { Providers } from "@/components/providers";
import { currentUser } from "@/server/auth/session";
import { unitIsDeskless } from "@/server/services/access";

// Um layout só para todas as áreas: sidebar e topo nunca remontam, nem do admin para a recepção
export default async function ShellLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <Providers>
      <AppShell role={user.role} name={user.name} deskless={user.role === "FISIOTERAPEUTA" && (await unitIsDeskless(user.unitId))}>
        {user.role === "PACIENTE" && !user.onboardedAt && <Onboarding />}
        {children}
      </AppShell>
    </Providers>
  );
}
