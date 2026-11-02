import { AgendaDesk } from "@/components/agenda-desk";
import { DAY, startOfRecifeDay } from "@/lib/time";
import { unitAgenda } from "@/server/services/sessions";

export const metadata = { title: "Agenda" };

export default async function Page() {
  const from = startOfRecifeDay(new Date());
  const rows = await unitAgenda(undefined, from, new Date(from.getTime() + DAY));
  return <AgendaDesk initial={JSON.parse(JSON.stringify(rows))} day={from.getTime()} serverAt={new Date().getTime()} />;
}
