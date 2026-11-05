import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: () => {} }) }));
const { AppShell } = await import("./app-shell");

describe("Botão Voltar à página inicial", () => {
  it.each(["PACIENTE", "RECEPCAO", "FISIOTERAPEUTA", "ADMIN"])("aparece no rodapé da sidebar e no topo do celular para %s", (role) => {
    const html = renderToStaticMarkup(
      createElement(QueryClientProvider, { client: new QueryClient() }, createElement(AppShell as (p: { role: string; name: string }) => ReturnType<typeof AppShell>, { role, name: "Pessoa Teste" })),
    );
    // Sidebar (com rótulo e tooltip para o modo recolhido) + ícone no cabeçalho do celular
    expect(html.match(/aria-label="Voltar à página inicial"/g)?.length).toBe(2);
    expect(html).toMatch(/<a aria-label="Voltar à página inicial" class="side-home[^"]*" href="\/">/);
    expect(html).toContain('<span aria-hidden="true" class="nav-tip">Voltar à página inicial</span>');
    // Acima do bloco de nome, sino, tema e sair, logo depois da linha divisória
    const divider = html.indexOf("side-divider"), home = html.indexOf("side-home"), name = html.indexOf("Pessoa Teste");
    expect(divider).toBeGreaterThan(-1);
    expect(divider < home && home < name).toBe(true);
  });
});

describe("Barra inferior do celular", () => {
  const tabs = (role: string, client = new QueryClient()) => {
    const html = renderToStaticMarkup(
      createElement(QueryClientProvider, { client }, createElement(AppShell as (p: { role: string; name: string }) => ReturnType<typeof AppShell>, { role, name: "Pessoa Teste" })),
    );
    return html.slice(html.indexOf('aria-label="Abas"'));
  };

  it.each(["PACIENTE", "RECEPCAO", "ADMIN"])("%s: no máximo 5 itens e sem rolagem lateral", (role) => {
    const bar = tabs(role);
    expect(bar.match(/<li /g)?.length).toBeLessThanOrEqual(5);
    expect(bar).not.toContain("overflow-x-auto");
  });

  it("paciente: 4 abas + Mais (Unidades, Perfil e Voltar à página inicial ficam na folha)", () => {
    const bar = tabs("PACIENTE");
    for (const label of ["Tratamento", "Mobilidade", "Agendar", "Troca", "Mais"]) expect(bar).toContain(`>${label}</span>`);
    expect(bar).not.toContain('href="/app/perfil"');
    expect(bar).toContain('aria-haspopup="dialog"');
  });

  it("cadeado na Mobilidade só enquanto o pagamento aguarda", () => {
    expect(tabs("PACIENTE")).not.toContain("liberada após a confirmação do pagamento");
    const client = new QueryClient();
    client.setQueryData(["home"], { treatment: null, awaiting: { id: "p1" } });
    expect(tabs("PACIENTE", client)).toContain('aria-label="Mobilidade (liberada após a confirmação do pagamento)"');
  });
});
