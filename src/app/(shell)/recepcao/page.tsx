import { AgendaDesk } from "@/components/agenda-desk";
import { DAY, startOfRecifeDay } from "@/lib/time";
import { currentUser } from "@/server/auth/session";
import { googleConfigured } from "@/server/services/google";
import { unitAgenda } from "@/server/services/sessions";

export const metadata = { title: "Agenda" };

export default async function Page() {
  const user = (await currentUser())!;
  // Recepção vê a própria unidade; admin, todas
  const fixedUnit = user.role === "RECEPCAO" ? user.unitId : null;
  const from = startOfRecifeDay(new Date());
  const rows = await unitAgenda(fixedUnit ?? undefined, from, new Date(from.getTime() + DAY));
  return <AgendaDesk initial={JSON.parse(JSON.stringify(rows))} day={from.getTime()} serverAt={new Date().getTime()} fixedUnit={fixedUnit} google={googleConfigured()} />;
}
