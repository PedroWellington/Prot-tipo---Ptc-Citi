import { ListSkeleton, Skeleton } from "@/components/ui";

// Só aparece se a rota ainda não foi pré-carregada; o shell continua na tela
export default function Loading() {
  return (
    <>
      <Skeleton className="mb-6 h-12 w-56" />
      <ListSkeleton />
    </>
  );
}
