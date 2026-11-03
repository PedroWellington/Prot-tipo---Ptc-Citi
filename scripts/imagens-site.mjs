// Converte as fotos da página pública em WebP (640, 1024, 1600 px), sem metadados, e gera dimensões e placeholder desfocado.
//   node scripts/imagens-site.mjs <pasta-com-os-originais>
// Espera <pasta>/espaco.jpg e <pasta>/exercicios.jpg. Créditos e licenças no README ("Imagens da página pública").
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const src = process.argv[2];
if (!src) throw new Error("Informe a pasta com os originais");
const out = path.resolve("public/site");
mkdirSync(out, { recursive: true });

const WIDTHS = [640, 1024, 1600];
const meta = {};
for (const name of ["espaco", "exercicios"]) {
  const input = sharp(path.join(src, `${name}.jpg`)).rotate();
  for (const w of WIDTHS) await input.clone().resize({ width: w }).webp({ quality: 72, effort: 6 }).toFile(path.join(out, `${name}-${w}.webp`));
  const big = await sharp(path.join(out, `${name}-1600.webp`)).metadata();
  const blur = await input.clone().resize({ width: 16 }).webp({ quality: 40 }).toBuffer();
  meta[name] = { width: big.width, height: big.height, blur: `data:image/webp;base64,${blur.toString("base64")}` };
  console.log(name, big.width, "x", big.height);
}
writeFileSync(path.resolve("src/lib/site-images.ts"),
  `// Gerado por scripts/imagens-site.mjs: dimensões fixas (CLS zero) e placeholder desfocado de cada foto\n` +
  `export const SITE_IMAGES = ${JSON.stringify(meta, null, 2)} as const;\n` +
  `export const SITE_WIDTHS = ${JSON.stringify(WIDTHS)} as const;\n`);
