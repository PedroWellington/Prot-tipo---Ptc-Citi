import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "../db";
import { COOKIE, SESSION_DAYS, signSession, verifySession, type Claims } from "./jwt";

export async function setSessionCookie(claims: Claims) {
  (await cookies()).set(COOKIE, await signSession(claims), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.APP_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export const clearSessionCookie = async () => (await cookies()).delete(COOKIE);

/** Usuário atual, conferido no banco (conta excluída ou senha trocada invalidam o JWT). */
export const currentUser = cache(async () => {
  const claims = await verifySession((await cookies()).get(COOKIE)?.value);
  if (!claims) return null;
  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: {
      id: true, name: true, email: true, role: true, unitId: true, tokenVersion: true, deletedAt: true,
      mustChangePassword: true, onboardedAt: true,
      patient: { select: { id: true } },
      physio: { select: { id: true } },
    },
  });
  if (!user || user.deletedAt || user.tokenVersion !== claims.tv) return null;
  return user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;
