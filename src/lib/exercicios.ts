/**
 * Exercícios prévios genéricos: o padrão que o script scripts/exercicios-previos.ts insere.
 * Depois disso o admin edita em Admin > Textos. Links verificados em 2026-11-05 (ver README).
 */
export const EXERCISE_CATEGORIES = ["Mobilidade", "Fortalecimento"] as const;

// Só YouTube, em https, com id de 11 caracteres; aceita o início no tempo do capítulo (&t=490s)
export const YOUTUBE_URL = /^https:\/\/(www\.youtube\.com\/(watch\?v=[\w-]{11}(&t=\d+s)?|shorts\/[\w-]{11})|youtu\.be\/[\w-]{11}(\?t=\d+)?)$/;

export const DEFAULT_EXERCISES = [
  {
    slug: "pescoco", name: "Rotação suave de pescoço", category: "Mobilidade", region: "Pescoço",
    prescription: "2 x 10 (cada lado)", rest: "30 segundos",
    videoUrl: "https://www.youtube.com/watch?v=bolyL-Q6KPU", videoChannel: "Dr. Robson Sitta (fisioterapeuta)",
  },
  {
    // Sem vídeo: não houve um vídeo confiável que mostre exatamente este movimento
    slug: "ombros", name: "Círculos de ombro", category: "Mobilidade", region: "Ombros",
    prescription: "2 x 10 (para trás)", rest: "30 segundos", videoUrl: null, videoChannel: null,
  },
  {
    slug: "gato-camelo", name: "Gato-camelo", category: "Mobilidade", region: "Coluna",
    prescription: "2 x 10", rest: "30 segundos",
    videoUrl: "https://www.youtube.com/watch?v=IUYz5xHrQNo", videoChannel: "Cristiane Lage (fisioterapeuta)",
  },
  {
    slug: "ponte", name: "Ponte de glúteos", category: "Fortalecimento", region: "Quadril e glúteos",
    prescription: "3 x 12", rest: "45 segundos",
    videoUrl: "https://www.youtube.com/watch?v=-Nzmu7H881I", videoChannel: "Márcio Brito fisio",
  },
  {
    slug: "agachamento-parede", name: "Agachamento na parede", category: "Fortalecimento", region: "Coxas e joelhos",
    prescription: "3 x 30 segundos", rest: "60 segundos",
    videoUrl: "https://www.youtube.com/watch?v=bPCnN6zHJEg&t=490s", videoChannel: "Fisioterapia com Kelwin Juan",
  },
  {
    slug: "quadriceps-toalha", name: "Ativação do quadríceps com toalha", category: "Fortalecimento", region: "Joelhos",
    prescription: "3 x 10 (segure 5 segundos)", rest: "30 segundos",
    videoUrl: "https://www.youtube.com/watch?v=bPCnN6zHJEg&t=165s", videoChannel: "Fisioterapia com Kelwin Juan",
  },
].map((e, position) => ({ ...e, level: "Leve", generic: true, position }));
