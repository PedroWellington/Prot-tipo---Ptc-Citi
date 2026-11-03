import { redirect } from "next/navigation";

// Nome antigo da tela: "Métricas" virou "Análises"
export default function Page() {
  redirect("/admin?aba=faltas");
}
