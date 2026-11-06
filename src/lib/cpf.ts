export const onlyDigits = (v: string) => v.replace(/\D/g, "");

/**
 * Protótipo de demonstração: aceita qualquer número de 11 dígitos (sem dígitos verificadores nem a regra de
 * sequências repetidas), para ninguém precisar de um CPF real. A mesma regra vale no formulário e na API.
 */
export const CPF_LEN = 11;
export const hasCpfFormat = (input: string) => onlyDigits(input).length === CPF_LEN;
export const CPF_INCOMPLETO = "Digite os 11 números do CPF";
export const CPF_AJUDA = "Protótipo de demonstração: use qualquer número de 11 dígitos. Não informe dados pessoais reais.";

/** ***.123.456-** */
export function maskCpf(input: string): string {
  const cpf = onlyDigits(input);
  if (cpf.length !== 11) return "***.***.***-**";
  return `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;
}

export function formatCpfInput(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}
