import { Skeleton } from "./ui";

/**
 * Esqueletos com o mesmo formato da tela final (título, cartões, filtros, lista), para a troca de rota
 * não "pular" quando o conteúdo chega. Só aparecem se a rota ainda não estava pré-carregada.
 */
function Title() {
  return (
    <div className="mb-6 flex flex-col gap-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-10 w-48" />
    </div>
  );
}

function Rows({ n = 5 }: { n?: number }) {
  return (
    <div className="card divide-y divide-line overflow-hidden">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <Skeleton className="h-7 w-14" />
          <div className="flex flex-1 flex-col gap-2"><Skeleton className="h-4 w-2/5" /><Skeleton className="h-3 w-3/5" /></div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

const StatCards = ({ n }: { n: number }) => (
  <div className={n === 4 ? "grid grid-cols-2 gap-3 md:grid-cols-4" : "grid grid-cols-3 gap-3"}>
    {Array.from({ length: n }, (_, i) => <div key={i} className="card flex flex-col gap-3 p-4 sm:p-5"><Skeleton className="size-10 rounded-xl" /><Skeleton className="h-4 w-20" /><Skeleton className="h-8 w-10" /></div>)}
  </div>
);

/** Agenda da recepção (desk) ou da fisioterapeuta (physio). */
export function AgendaSkeleton({ desk }: { desk?: boolean }) {
  return (
    <div role="status" aria-label="Carregando a agenda">
      <Title />
      <div className="flex flex-col gap-4">
        {desk && <StatCards n={4} />}
        <Skeleton className="h-12 w-full rounded-full md:w-1/2" />
        {desk && <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_200px]"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>}
        <div className="flex items-center justify-between"><Skeleton className="size-11 rounded-full" /><Skeleton className="h-5 w-48" /><Skeleton className="size-11 rounded-full" /></div>
        {!desk && <StatCards n={3} />}
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Rows />
          {desk && <div className="card hidden h-56 xl:block" />}
        </div>
      </div>
    </div>
  );
}

/** Análises do administrador: abas, filtros e cartões de gráfico. */
export function AnalyticsSkeleton() {
  return (
    <div role="status" aria-label="Carregando as análises">
      <Title />
      <div className="mb-5 flex flex-col gap-3">
        <Skeleton className="h-12 w-full rounded-full" />
        <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-12 rounded-full" /><Skeleton className="h-12 rounded-full" /></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className="card flex flex-col gap-3 p-5"><Skeleton className="h-5 w-40" /><Skeleton className="h-48 w-full" /></div>)}
      </div>
    </div>
  );
}

/** Listas simples (pacientes, filas): título + linhas. */
export function ListPageSkeleton() {
  return (
    <div role="status" aria-label="Carregando">
      <Title />
      <Skeleton className="mb-4 h-12 w-full" />
      <Rows n={6} />
    </div>
  );
}
