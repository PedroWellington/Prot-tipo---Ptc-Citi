import { haversineKm } from "./schedule";

export type Point = { lat: number; lng: number };
export type Bairro = { nome: string; rpa: number; centroide: Point; poligonos: [number, number][][] };

export const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Busca sem acento; quem começa com o termo vem antes de quem só contém. */
export function buscarBairros(lista: Bairro[], termo: string, limite = 8): Bairro[] {
  const t = normalizar(termo);
  if (!t) return lista.slice(0, limite);
  const inicio: Bairro[] = [];
  const meio: Bairro[] = [];
  for (const b of lista) {
    const n = normalizar(b.nome);
    if (n.startsWith(t)) inicio.push(b);
    else if (n.includes(t)) meio.push(b);
  }
  return [...inicio, ...meio].slice(0, limite);
}

/** Ray casting. Coordenadas do polígono em [lng, lat], como no GeoJSON. */
export function pontoNoPoligono({ lat, lng }: Point, anel: [number, number][]): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Bairro que contém o ponto; fora dos limites (ou no vão da simplificação), o de centroide mais próximo. */
export function localizarBairro(ponto: Point, lista: Bairro[]): { bairro: Bairro; exato: boolean } | null {
  if (!lista.length) return null;
  const exato = lista.find((b) => b.poligonos.some((p) => pontoNoPoligono(ponto, p)));
  if (exato) return { bairro: exato, exato: true };
  const bairro = lista.reduce((melhor, b) => (haversineKm(ponto, b.centroide) < haversineKm(ponto, melhor.centroide) ? b : melhor));
  return { bairro, exato: false };
}

export function ordenarPorDistancia<T extends Point>(origem: Point, unidades: T[]): (T & { km: number })[] {
  return unidades.map((u) => ({ ...u, km: haversineKm(origem, u) })).sort((a, b) => a.km - b.km);
}
