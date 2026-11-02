import { jwtVerify, SignJWT } from "jose";

// Sem Prisma/Node aqui: também é usado pelo proxy.ts
export const COOKIE = "mv_session";
export const SESSION_DAYS = 7;

export type Role = "ADMIN" | "RECEPCAO" | "FISIOTERAPEUTA" | "PACIENTE";
export type Claims = { sub: string; role: Role; tv: number; mcp: boolean };

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error("JWT_SECRET ausente ou curto (mínimo 32 caracteres)");
  return new TextEncoder().encode(s);
}

export const signSession = (c: Claims) =>
  new SignJWT({ role: c.role, tv: c.tv, mcp: c.mcp })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(c.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());

export async function verifySession(token: string | undefined): Promise<Claims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return { sub: payload.sub!, role: payload.role as Role, tv: payload.tv as number, mcp: payload.mcp as boolean };
  } catch {
    return null;
  }
}

export const homeFor = (role: Role) =>
  ({ ADMIN: "/admin", RECEPCAO: "/recepcao", FISIOTERAPEUTA: "/fisio", PACIENTE: "/app" })[role];
