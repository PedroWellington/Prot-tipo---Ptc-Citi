// Gera data/bairros-recife.json a partir dos dados abertos da Prefeitura do Recife.
// Uso: node scripts/gerar-bairros.mjs [arquivo.geojson]   (sem argumento, baixa da fonte)
import { readFile, writeFile } from "node:fs/promises";

const FONTE = "https://dados.recife.pe.gov.br/dataset/1702c764-ec7a-4ef0-9861-8acd0e40c819/resource/5c67ce14-1799-40c4-a37c-9daa04d1761c/download/bairros-do-recife.geojson";
const TOLERANCIA = 0.00015; // cerca de 16 m: mantém o arquivo pequeno sem deformar os limites
const TOTAL_ESPERADO = 94;

const arquivo = process.argv[2];
const geo = JSON.parse(arquivo ? await readFile(arquivo, "utf8") : await (await fetch(FONTE)).text());

function douglasPeucker(pts, tol) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts.at(-1)];
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * (pts[i][0] - a[0]) - dx * (pts[i][1] - a[1])) / len;
    if (d > max) { max = d; idx = i; }
  }
  if (max <= tol) return [a, b];
  return [...douglasPeucker(pts.slice(0, idx + 1), tol).slice(0, -1), ...douglasPeucker(pts.slice(idx), tol)];
}

// Anel fechado: divide em dois para o algoritmo não colapsar início e fim no mesmo ponto
function simplificar(anel) {
  const meio = Math.floor(anel.length / 2);
  const r = [...douglasPeucker(anel.slice(0, meio + 1), TOLERANCIA).slice(0, -1), ...douglasPeucker(anel.slice(meio), TOLERANCIA)];
  return r.map(([x, y]) => [Number(x.toFixed(5)), Number(y.toFixed(5))]);
}

function centroide(aneis) {
  let area = 0, cx = 0, cy = 0;
  for (const anel of aneis)
    for (let i = 0; i < anel.length - 1; i++) {
      const c = anel[i][0] * anel[i + 1][1] - anel[i + 1][0] * anel[i][1];
      area += c; cx += (anel[i][0] + anel[i + 1][0]) * c; cy += (anel[i][1] + anel[i + 1][1]) * c;
    }
  return { lat: Number((cy / (3 * area)).toFixed(5)), lng: Number((cx / (3 * area)).toFixed(5)) };
}

const bairros = geo.features.map((f) => {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  const exteriores = polys.map((p) => p[0]);
  return {
    nome: f.properties.EBAIRRNOMEOF.trim(),
    rpa: f.properties.CRPAAACODI,
    centroide: centroide(exteriores),
    poligonos: exteriores.map(simplificar),
  };
}).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

if (bairros.length !== TOTAL_ESPERADO || new Set(bairros.map((b) => b.nome)).size !== TOTAL_ESPERADO)
  throw new Error(`Esperava ${TOTAL_ESPERADO} bairros únicos, veio ${bairros.length}`);

await writeFile("data/bairros-recife.json", JSON.stringify({ fonte: FONTE, total: bairros.length, bairros }));
console.log(`${bairros.length} bairros gravados`);
