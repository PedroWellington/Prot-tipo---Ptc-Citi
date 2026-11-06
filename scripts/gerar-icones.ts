// Gera o favicon e os PNGs do PWA a partir do monograma (src/lib/marca.ts). Rode de novo ao trocar a marca: npm run icons
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { caminhos, TRACO, VARIANTE_PADRAO } from "../src/lib/marca";

// Fundo azul-marinho da banda do site e o degradê turquesa → azul da marca (os mesmos tons de tokens.css)
const FUNDO = "#0f2f57";
const [DE, ATE] = ["#5fe9dc", "#4aa8ff"];

/** Ícone quadrado; `escala` é a fração do lado ocupada pelo monograma (menor no maskable, que é recortado em círculo). */
const svg = (lado: number, escala: number, cantos = 0) => {
  const s = lado * escala;
  const o = (lado - s) / 2;
  const paths = caminhos(VARIANTE_PADRAO).map((d) => `<path d="${d}" fill="none" stroke="url(#g)" stroke-width="${TRACO}" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 ${lado} ${lado}">
  <rect width="${lado}" height="${lado}" rx="${cantos}" fill="${FUNDO}"/>
  <svg x="${o}" y="${o}" width="${s}" height="${s}" viewBox="0 0 48 48">
    <defs><linearGradient id="g" x1="4" x2="44" y1="0" y2="0" gradientUnits="userSpaceOnUse"><stop stop-color="${DE}"/><stop offset="1" stop-color="${ATE}"/></linearGradient></defs>
    ${paths}
  </svg>
</svg>`;
};

async function main() {
  await mkdir("public/icons", { recursive: true });
  await writeFile("public/icons/marca.svg", svg(64, 0.84, 14));
  await sharp(Buffer.from(svg(32, 0.88, 7))).png().toFile("public/icons/favicon-32.png");
  await sharp(Buffer.from(svg(180, 0.78))).png().toFile("public/icons/apple-180.png");
  await sharp(Buffer.from(svg(192, 0.78))).png().toFile("public/icons/icon-192.png");
  await sharp(Buffer.from(svg(512, 0.78))).png().toFile("public/icons/icon-512.png");
  await sharp(Buffer.from(svg(512, 0.58))).png().toFile("public/icons/maskable-512.png");
  console.log("ícones gerados com a variante", VARIANTE_PADRAO);
}

void main();
