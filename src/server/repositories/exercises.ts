import { prisma } from "../db";

/** Exercícios prévios com o "feito" do paciente. */
export async function genericExercises(patientId: string) {
  const rows = await prisma.exercise.findMany({
    where: { generic: true }, orderBy: { position: "asc" },
    select: { id: true, slug: true, name: true, category: true, region: true, level: true, prescription: true, rest: true, videoUrl: true, done: { where: { patientId }, select: { doneAt: true } } },
  });
  return rows.map(({ done, ...e }) => ({ ...e, doneAt: done[0]?.doneAt ?? null }));
}

export const exerciseExists = async (id: string) => !!(await prisma.exercise.findUnique({ where: { id }, select: { id: true } }));

export const setExerciseDone = (patientId: string, exerciseId: string, done: boolean) =>
  done
    ? prisma.exerciseDone.upsert({ where: { patientId_exerciseId: { patientId, exerciseId } }, create: { patientId, exerciseId }, update: {} })
    : prisma.exerciseDone.deleteMany({ where: { patientId, exerciseId } });

export const listExercises = () => prisma.exercise.findMany({ orderBy: { position: "asc" } });

export const updateExercise = (id: string, data: { name?: string; region?: string; prescription?: string; rest?: string; videoUrl?: string | null; videoChannel?: string | null }) =>
  prisma.exercise.update({ where: { id }, data });
