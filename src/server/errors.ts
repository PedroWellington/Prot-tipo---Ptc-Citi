export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

export const notFound = (what = "Registro") => new AppError(404, "NAO_ENCONTRADO", `${what} não encontrado.`);
export const forbidden = () => new AppError(403, "SEM_PERMISSAO", "Você não tem permissão para esta ação.");
export const conflict = (msg: string) => new AppError(409, "CONFLITO", msg);
export const badRequest = (msg: string) => new AppError(400, "INVALIDO", msg);
export const slotTaken = () => conflict("Esse horário acabou de ser ocupado. Escolha outro, por favor.");
