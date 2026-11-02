// Gera os PNGs do PWA a partir do monograma. Rode de novo ao trocar a cor: npm run icons
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const svg = (size, scale) => {
  const s = size * scale;
  const o = (size - s) / 2;
  const x = (v) => o + (v / 100) * s;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#6ee7a8"/><stop offset="1" stop-color="#4aa8e8"/></linearGradient></defs>
    <rect width="${size}" height="${size}" fill="#052e1f"/>
    <path d="M${x(18)} ${x(78)}V${x(24)}L${x(50)} ${x(62)}L${x(82)} ${x(24)}V${x(78)}" fill="none" stroke="url(#g)" stroke-width="${s * 0.075}" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`);
};

await mkdir("public/icons", { recursive: true });
await sharp(svg(192, 0.8)).png().toFile("public/icons/icon-192.png");
await sharp(svg(512, 0.8)).png().toFile("public/icons/icon-512.png");
await sharp(svg(512, 0.6)).png().toFile("public/icons/maskable-512.png");
