import { describe, expect, it } from "vitest";
import { EMAIL_NOTE, maskEmail, mergeContent, RESEND_SECONDS, resendWait, safeNext, SITE_FIELDS } from "./site-content";

describe("Página pública: ?next= só aceita rotas internas", () => {
  it.each([["/app/agendar", "/app/agendar"], ["/app/agendar?x=1", "/app/agendar?x=1"], ["/recepcao", "/recepcao"]])("%s → %s", (raw, out) => expect(safeNext(raw)).toBe(out));
  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "app/agendar", "/api/auth/logout", "", null, `/${"a".repeat(300)}`, "/app/<script>"])("recusa %s", (raw) => expect(safeNext(raw)).toBeNull());
});

describe("Cadastro: e-mail e reenvio", () => {
  it("e-mail aparece parcialmente oculto", () => {
    expect(maskEmail("joana.souza@gmail.com")).toBe("jo***@gmail.com");
    expect(maskEmail("ab@x.com")).toBe("a***@x.com");
    expect(maskEmail("sem-arroba")).toBe("***");
  });
  it("reenvio só depois de 60 s", () => {
    const t = 1_000_000;
    expect(RESEND_SECONDS).toBe(60);
    expect(resendWait(t, t)).toBe(60);
    expect(resendWait(t, t + 59_001)).toBe(1);
    expect(resendWait(t, t + 60_000)).toBe(0);
    expect(resendWait(t, t + 120_000)).toBe(0);
  });
  it("o aviso de e-mail tem o texto combinado", () => {
    expect(EMAIL_NOTE).toBe("Use um e-mail de verdade: vamos enviar um código de confirmação para você concluir o cadastro. Se não chegar, olhe a caixa de spam.");
  });
});

describe("Textos editáveis", () => {
  it("o que o admin salva substitui o padrão; vazio e chave desconhecida são ignorados", () => {
    const c = mergeContent([{ key: "hero.titulo", value: "Novo título" }, { key: "faq.1.q", value: "  " }, { key: "x.invalida", value: "nada" }]);
    expect(c["hero.titulo"]).toBe("Novo título");
    expect(c["faq.1.q"]).toBe(SITE_FIELDS.find((f) => f.key === "faq.1.q")!.value);
    expect(c["x.invalida"]).toBeUndefined();
  });
  it("todos os campos têm padrão, chave única e nenhum dado pessoal real", () => {
    const keys = SITE_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    const all = SITE_FIELDS.map((f) => f.value).join("\n");
    expect(all).not.toMatch(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/); // CPF
    expect(all.match(/[\w.+-]+@[\w.-]+/g)?.every((e) => e.endsWith(".example"))).toBe(true); // só domínio reservado
  });
});
