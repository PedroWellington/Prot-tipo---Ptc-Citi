import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";

export const metadata = { title: "Sem conexão" };

export default function OfflinePage() {
  return (
    <AuthFrame title="Você está offline" subtitle="Assim que a internet voltar, seus dados aparecem aqui de novo. Nada do que você fez foi perdido.">
      {/* "/" virou a página pública; /login leva quem já tem sessão direto à própria área */}
      <Link href="/login" prefetch={false} className="btn btn-ghost w-full">Tentar novamente</Link>
    </AuthFrame>
  );
}
