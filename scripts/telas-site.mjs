// Converte as capturas do sistema (modo demonstração, dados fictícios) em WebP para os mockups da página pública.
//   node scripts/telas-site.mjs <pasta-com-as-capturas>
// Espera <pasta>/<tela>-<claro|escuro>.png para cada tela abaixo. Capturas sem CPF, e-mail ou telefone (ver README).
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const src = process.argv[2];
if (!src) throw new Error("Informe a pasta com as capturas");
const out = path.resolve("public/site");
mkdirSync(out, { recursive: true });

// Versão no nome: /site tem cache imutável de 1 ano; ao refazer as capturas, suba a versão (e em mockup.tsx)
const VERSAO = "v2";
const WIDTHS = [640, 1024, 1600];
// Só as telas do paciente: a página pública não mostra as visões internas da clínica
const SCREENS = ["paciente-celular", "paciente-desktop"];
const meta = {};
for (const name of SCREENS) {
  for (const tema of ["claro", "escuro"]) {
    const input = sharp(path.join(src, `${name}-${tema}.png`));
    // Telas têm texto pequeno: qualidade um pouco maior que a das fotos, sem aumentar além do original
    for (const w of WIDTHS)
      await input.clone().resize({ width: w, withoutEnlargement: true }).webp({ quality: 74, effort: 6 }).toFile(path.join(out, `tela-${VERSAO}-${name}-${tema}-${w}.webp`));
    const big = await input.metadata();
    const blur = await input.clone().resize({ width: 12 }).webp({ quality: 40 }).toBuffer();
    meta[`${name}-${tema}`] = { width: big.width, height: big.height, blur: `data:image/webp;base64,${blur.toString("base64")}` };
    console.log(name, tema, big.width, "x", big.height);
  }
}
writeFileSync(path.resolve("src/lib/site-screens.ts"),
  `// Gerado por scripts/telas-site.mjs: dimensões fixas (CLS zero) e placeholder desfocado de cada tela do mockup\n` +
  `export const SITE_SCREENS = ${JSON.stringify(meta, null, 2)} as const;\n`);
