import { AgendaPhysio } from "@/components/agenda-physio";
import { DAY, startOfRecifeDay } from "@/lib/time";
import { currentUser } from "@/server/auth/session";
import { physioAgenda } from "@/server/services/sessions";

export const metadata = { title: "Minha agenda" };

export default async function Page() {
  const user = (await currentUser())!;
  const from = startOfRecifeDay(new Date());
  const rows = user.physio ? await physioAgenda(user.physio.id, from, new Date(from.getTime() + DAY)) : [];
  return <AgendaPhysio initial={JSON.parse(JSON.stringify(rows))} day={from.getTime()} serverAt={new Date().getTime()} />;
}
