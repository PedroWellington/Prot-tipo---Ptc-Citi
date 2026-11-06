import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CPF_AJUDA, CPF_INCOMPLETO } from "@/lib/cpf";
import { routes } from "./router";
import "./routes";

// Só importa a tabela de rotas (esquemas Zod da API): nenhuma consulta ao banco acontece aqui
const body = (cpf: string) => ({ cpf, email: "pessoa@exemplo.test", name: "Pessoa Teste", phone: "(81) 90000-0000", type: "PARTICULAR", consent: true });

describe.each([["POST", "/auth/register/start"], ["POST", "/desk/patients"]])("CPF na API: %s %s", (method, p) => {
  const schema = routes.find((r) => r.method === method && r.path === p)!.options.body!;

  it("aceita qualquer número de 11 dígitos, mesmo com dígitos verificadores inválidos ou repetidos", () => {
    for (const cpf of ["529.982.247-24", "111.111.111-11", "12345678900", "000.000.000-00"]) {
      const r = schema.safeParse(body(cpf));
      expect(r.success, cpf).toBe(true);
    }
  });

  it("rejeita só o formato incompleto, com a mensagem de formato", () => {
    for (const cpf of ["123", "529.982.247-2", ""]) {
      const r = schema.safeParse(body(cpf));
      expect(r.success).toBe(false);
      expect(r.error!.issues.find((i) => i.path[0] === "cpf")?.message).toBe(CPF_INCOMPLETO);
    }
  });
});

describe("CPF no formulário", () => {
  const form = readFileSync(path.resolve(__dirname, "../../components/patient-form.tsx"), "utf8");
  it("o formulário confere o mesmo formato antes de enviar e mostra a ajuda do protótipo", () => {
    expect(form).toContain("hasCpfFormat(");
    expect(form).toContain("CPF_INCOMPLETO");
    expect(form).toContain("cpfHint ?? CPF_AJUDA");
    expect(CPF_AJUDA).toMatch(/qualquer número de 11 dígitos/);
  });
  it("a regra de CPF único por conta continua no serviço", () => {
    const auth = readFileSync(path.resolve(__dirname, "../services/auth.ts"), "utf8");
    expect(auth).toContain("emailOrCpfTaken");
  });
});
