import type { CurrentUser } from "../auth/session";
import { notFound } from "../errors";
import { audit } from "../repositories/config";
import * as repo from "../repositories/exercises";
import { assertTreatmentUnlocked } from "./payments";

export async function markGenericDone(patientId: string, exerciseId: string, done: boolean) {
  await assertTreatmentUnlocked(patientId);
  if (!(await repo.exerciseExists(exerciseId))) throw notFound("Exercício");
  await repo.setExerciseDone(patientId, exerciseId, done);
}

export const adminExercises = repo.listExercises;

export async function saveExercise(user: CurrentUser, id: string, data: Parameters<typeof repo.updateExercise>[1]) {
  if (!(await repo.exerciseExists(id))) throw notFound("Exercício");
  await repo.updateExercise(id, data);
  await audit(user.id, "EXERCICIO_ALTERADO", "Exercise", id, data);
}
