import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "patient-home.tsx"), "utf8");
// Só o painel (HomeClient); a aba Mobilidade (MobilityClient) vem depois e continua com os exercícios
const home = src.slice(src.indexOf("export function HomeClient"), src.indexOf("export function MobilityClient"));
const mobility = src.slice(src.indexOf("export function MobilityClient"));

describe("Painel do paciente sem o que já tem aba própria", () => {
  it("sem exercícios, calendário do mês nem atalhos coloridos", () => {
    expect(home).not.toMatch(/<Exercises|<GenericExercises|MiniMonth|Shortcuts/);
    expect(src).not.toMatch(/function Shortcuts|SHORTCUTS/);
  });

  it("com boas-vindas, próxima sessão, evolução da dor, conquistas e sua unidade, nesta ordem (a do celular)", () => {
    const active = home.slice(home.indexOf("const { treatment: t"));
    const at = (s: string) => active.indexOf(s);
    const order = ["<Hero", "<NextCard", "<PainChart", "<Achievements", "<UnitCard"].map(at);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(active).toContain("Agendar mais sessões");
  });

  it("a aba Mobilidade continua com os exercícios e bloqueada sem pagamento autorizado", () => {
    expect(mobility).toMatch(/<Exercises items=\{t\.guidances\} \/>/);
    expect(mobility).toMatch(/<GenericExercises/);
    expect(mobility).toMatch(/data\.awaiting \|\| !data\.treatment/);
  });
});
