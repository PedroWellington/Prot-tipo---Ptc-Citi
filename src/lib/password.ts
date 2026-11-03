// Fonte única das regras: a tela mostra estas e o servidor valida estas
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // limite do bcrypt

export const PASSWORD_RULES = [
  { id: "tamanho", label: `Pelo menos ${PASSWORD_MIN} caracteres`, test: (p: string) => p.length >= PASSWORD_MIN },
  { id: "letra", label: "Pelo menos uma letra", test: (p: string) => /[a-zA-Z]/.test(p) },
  { id: "numero", label: "Pelo menos um número", test: (p: string) => /\d/.test(p) },
];

export const passwordOk = (p: string) => p.length <= PASSWORD_MAX && PASSWORD_RULES.every((r) => r.test(p));
export const passwordReady = (password: string, confirm: string) => passwordOk(password) && password === confirm;
