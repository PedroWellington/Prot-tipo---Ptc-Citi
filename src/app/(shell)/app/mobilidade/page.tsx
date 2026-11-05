import { Suspense } from "react";
import { HomeSkeleton, MobilityClient, type Home } from "@/components/patient-home";
import { PageTitle } from "@/components/ui";
import { currentUser } from "@/server/auth/session";
import { patientHome } from "@/server/services/patients";

export const metadata = { title: "Mobilidade" };

// Mesma fonte da aba Tratamento: sem pagamento autorizado, o servidor já devolve só o estado bloqueado
async function Load() {
  const user = (await currentUser())!;
  const data = JSON.parse(JSON.stringify(await patientHome(user.patient!.id))) as Home;
  return <MobilityClient initial={data} serverAt={new Date().getTime()} />;
}

export default function Page() {
  return (
    <>
      <PageTitle eyebrow="Exercícios" title="Mobilidade" />
      <Suspense fallback={<HomeSkeleton />}><Load /></Suspense>
    </>
  );
}
