import { AuthFrame } from "@/components/auth-frame";

export const metadata = { title: "Sem conexão" };

export default function OfflinePage() {
  return (
    <AuthFrame title="Você está offline" subtitle="Assim que a internet voltar, seus dados aparecem aqui de novo. Nada do que você fez foi perdido.">
      <a href="/" className="btn btn-ghost w-full">Tentar novamente</a>
    </AuthFrame>
  );
}
