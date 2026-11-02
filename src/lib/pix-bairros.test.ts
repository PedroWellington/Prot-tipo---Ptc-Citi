import { describe, expect, it } from "vitest";
import dados from "../../data/bairros-recife.json";
import { buscarBairros, localizarBairro, ordenarPorDistancia, pontoNoPoligono, type Bairro } from "./bairros";
import { buildPixPayload, crc16 } from "./pix";

const bairros = dados.bairros as unknown as Bairro[];

describe("PIX", () => {
  it("calcula o CRC16-CCITT-FALSE do vetor padrão", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("reproduz o exemplo do Manual do BR Code", () => {
    expect(buildPixPayload({ key: "123e4567-e12b-12d1-a456-426655440000", merchantName: "Fulano de Tal", merchantCity: "BRASILIA" }))
      .toBe("00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D");
  });

  it("inclui valor e txid, e o CRC confere com o conteúdo", () => {
    const code = buildPixPayload({ key: "chave@exemplo.test", merchantName: "Clinica", merchantCity: "Recife", amountCents: 110000, txid: "ABC123" });
    expect(code).toContain("54071100.00");
    expect(code).toContain("0506ABC123");
    expect(crc16(code.slice(0, -4))).toBe(code.slice(-4));
  });

  it("remove acentos e respeita os limites do padrão", () => {
    const code = buildPixPayload({ key: "k", merchantName: "Clínica Movimento Fisioterapia Avançada", merchantCity: "São José do Belmonte Grande", amountCents: 11000 });
    expect(code).toContain("5925Clinica Movimento Fisiote");
    expect(code).toContain("6015Sao Jose do Bel");
    expect(/^[\x20-\x7e]+$/.test(code)).toBe(true);
  });
});

describe("Bairros", () => {
  it("traz os 94 bairros oficiais sem repetição", () => {
    expect(bairros).toHaveLength(94);
    expect(new Set(bairros.map((b) => b.nome)).size).toBe(94);
  });

  it("cada centroide cai em Recife e, nos bairros convexos, dentro do polígono", () => {
    for (const b of bairros) expect(localizarBairro(b.centroide, bairros)).not.toBeNull();
    const bv = bairros.find((b) => b.nome === "Boa Viagem")!;
    expect(bv.poligonos.some((p) => pontoNoPoligono(bv.centroide, p))).toBe(true);
  });

  it("identifica o bairro pelas coordenadas das unidades", () => {
    expect(localizarBairro({ lat: -8.1197, lng: -34.906 }, bairros)?.bairro.nome).toBe("Boa Viagem");
    expect(localizarBairro({ lat: -8.0339, lng: -34.9186 }, bairros)?.bairro.nome).toBe("Casa Forte");
  });

  it("fora de Recife usa o centroide mais próximo e avisa que não é exato", () => {
    const r = localizarBairro({ lat: -8.0, lng: -34.85 }, bairros);
    expect(r?.exato).toBe(false);
    expect(r?.bairro.nome).toBeTruthy();
  });

  it("busca ignora acento e prioriza o início do nome", () => {
    expect(buscarBairros(bairros, "agua")[0].nome).toBe("Água Fria");
    expect(buscarBairros(bairros, "VARZEA")[0].nome).toBe("Várzea");
    expect(buscarBairros(bairros, "boa").map((b) => b.nome)).toEqual(["Boa Viagem", "Boa Vista"]);
  });

  it("ordena as unidades pela mais próxima", () => {
    const unidades = [{ id: "bv", lat: -8.1197, lng: -34.906 }, { id: "cf", lat: -8.0376, lng: -34.917 }];
    const pina = bairros.find((b) => b.nome === "Pina")!.centroide;
    const apipucos = bairros.find((b) => b.nome === "Apipucos")!.centroide;
    expect(ordenarPorDistancia(pina, unidades)[0].id).toBe("bv");
    expect(ordenarPorDistancia(apipucos, unidades)[0].id).toBe("cf");
    expect(ordenarPorDistancia(pina, unidades)[0].km).toBeLessThan(ordenarPorDistancia(pina, unidades)[1].km);
  });
});
