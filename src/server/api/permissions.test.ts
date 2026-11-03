import { describe, expect, it } from "vitest";
import { routes } from "./router";
import "./routes";

// Só importa a tabela de rotas: nenhuma consulta ao banco acontece aqui
describe("Permissões das Análises", () => {
  const find = (method: string, path: string) => routes.find((r) => r.method === method && r.path === path);

  it.each([
    ["GET", "/analytics/financeiro"], ["GET", "/analytics/previsoes"], ["GET", "/analytics/backtest"],
    ["POST", "/analytics/assistente"], ["POST", "/analytics/export-audit"], ["POST", "/desk/sessions/:id/remind"],
  ])("%s %s: admin e recepção sim, fisioterapeuta e paciente não", (method, path) => {
    const r = find(method, path);
    expect(r).toBeDefined();
    expect(r!.options.roles).toEqual(expect.arrayContaining(["ADMIN", "RECEPCAO"]));
    expect(r!.options.roles).not.toContain("FISIOTERAPEUTA");
    expect(r!.options.roles).not.toContain("PACIENTE");
  });

  it("a aba Faltas (dashboard) segue só para o admin", () => {
    expect(find("GET", "/admin/dashboard")!.options.roles).toEqual(["ADMIN"]);
  });
});

describe("Telas e botão de exportar", async () => {
  const { NAV } = await import("@/components/app-shell");
  it("a fisioterapeuta não tem Análises, Previsões nem o assistente no menu", () => {
    const hrefs = NAV.FISIOTERAPEUTA.map((i) => i.href);
    expect(hrefs).not.toContain("/admin");
    expect(hrefs).not.toContain("/recepcao/previsoes");
  });
  it("admin vê Análises; recepção vê Previsões", () => {
    expect(NAV.ADMIN.find((i) => i.href === "/admin")?.label).toBe("Análises");
    expect(NAV.RECEPCAO.map((i) => i.href)).toContain("/recepcao/previsoes");
  });
});
