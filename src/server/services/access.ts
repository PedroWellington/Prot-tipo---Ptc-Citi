import type { CurrentUser } from "../auth/session";
import { forbidden } from "../errors";
import { usersByRole } from "../repositories/notifications";

export const unitIsDeskless = async (unitId: string | null) => !!unitId && !(await usersByRole("RECEPCAO", unitId)).length;

/** Fisioterapeuta só age como recepção com o próprio paciente, e só enquanto a unidade não tiver recepção. */
export async function assertDeskAccess(user: CurrentUser, unitId: string, physioId: string) {
  if (user.role !== "FISIOTERAPEUTA") return;
  if (user.physio?.id !== physioId || !(await unitIsDeskless(unitId))) throw forbidden();
}

/** Recorte das filas: recepção vê a própria unidade; fisioterapeuta, só os seus pacientes em unidade sem recepção. */
export async function deskScope(user: CurrentUser): Promise<{ unitId?: string; physioId?: string } | null> {
  if (user.role === "ADMIN") return {};
  if (user.role === "RECEPCAO") return { unitId: user.unitId ?? undefined };
  return (await unitIsDeskless(user.unitId)) ? { unitId: user.unitId!, physioId: user.physio!.id } : null;
}
