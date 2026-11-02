import { Suspense } from "react";
import { HomeClient, HomeSkeleton, type Home } from "@/components/patient-home";
import { currentUser } from "@/server/auth/session";
import { patientHome } from "@/server/services/patients";

export const metadata = { title: "Meu tratamento" };

async function Load() {
  const user = (await currentUser())!;
  const data = JSON.parse(JSON.stringify(await patientHome(user.patient!.id))) as Home;
  return <HomeClient initial={data} name={user.name.split(" ")[0]} serverAt={new Date().getTime()} />;
}

export default function Page() {
  return <Suspense fallback={<HomeSkeleton />}><Load /></Suspense>;
}
