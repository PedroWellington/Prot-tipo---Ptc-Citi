// Fotos da página pública já saem em 640, 1024 e 1600 px (scripts/imagens-site.mjs): o loader escolhe o arquivo
// pronto mais próximo, servido estático pela CDN, sem otimização em tempo de execução
const WIDTHS = [640, 1024, 1600];

export default function imageLoader({ src, width }: { src: string; width: number }) {
  return src.replace("{w}", String(WIDTHS.find((w) => w >= width) ?? WIDTHS.at(-1)));
}
