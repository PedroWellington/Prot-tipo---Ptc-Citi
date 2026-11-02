import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, homeFor, verifySession, type Role } from "./server/auth/jwt";

const AREAS: [string, Role[]][] = [
  ["/admin", ["ADMIN"]],
  ["/recepcao", ["ADMIN", "RECEPCAO"]],
  ["/fisio", ["ADMIN", "FISIOTERAPEUTA"]],
  ["/app", ["PACIENTE"]],
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const claims = await verifySession(req.cookies.get(COOKIE)?.value);
  const redirect = (to: string) => NextResponse.redirect(new URL(to, req.url));

  if (pathname === "/") return redirect(claims ? homeFor(claims.role) : "/login");
  if (pathname === "/login" || pathname === "/cadastro") return claims ? redirect(homeFor(claims.role)) : NextResponse.next();

  const area = AREAS.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (pathname === "/trocar-senha") return claims ? NextResponse.next() : redirect("/login");
  if (!area) return NextResponse.next();
  if (!claims) return redirect(`/login?volta=${encodeURIComponent(pathname)}`);
  if (claims.mcp) return redirect("/trocar-senha");
  if (!area[1].includes(claims.role)) return redirect(homeFor(claims.role));
  return NextResponse.next();
}

export const config = { matcher: ["/", "/login", "/cadastro", "/trocar-senha", "/admin/:path*", "/recepcao/:path*", "/fisio/:path*", "/app/:path*"] };
