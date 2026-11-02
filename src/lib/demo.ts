/** Ligado por padrão; em produção real, NEXT_PUBLIC_DEMO_MODE=false tira o banner e o reset. */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
