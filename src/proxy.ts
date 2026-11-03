import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "./lib/site-content";
import { COOKIE, homeFor, verifySession, type Role } from "./server/auth/jwt";

const DESK_WITH_PHYSIO: Role[] = ["ADMIN", "RECEPCAO", "FISIOTERAPEUTA"];

// A mais específica vem antes. As filas abertas à fisioterapeuta são filtradas e checadas na API
const AREAS: [string, Role[]][] = [
  ["/recepcao/trocas", DESK_WITH_PHYSIO],
  ["/recepcao/renovacoes", DESK_WITH_PHYSIO],
  ["/recepcao/pagamentos", DESK_WITH_PHYSIO],
  ["/admin", ["ADMIN"]],
  ["/recepcao", ["ADMIN", "RECEPCAO"]],
  ["/fisio", ["ADMIN", "FISIOTERAPEUTA"]],
  ["/app", ["PACIENTE"]],
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const claims = await verifySession(req.cookies.get(COOKIE)?.value);
  const redirect = (to: string) => NextResponse.redirect(new URL(to, req.url));

  // "/" é a página pública: fica fora do matcher e é servida estática
  if (pathname === "/login" || pathname === "/cadastro")
    return claims ? redirect(safeNext(req.nextUrl.searchParams.get("next")) ?? homeFor(claims.role)) : NextResponse.next();

  const area = AREAS.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (pathname === "/trocar-senha") return claims ? NextResponse.next() : redirect("/login");
  if (!area) return NextResponse.next();
  if (!claims) return redirect(`/login?next=${encodeURIComponent(pathname)}`);
  if (claims.mcp) return redirect("/trocar-senha");
  if (!area[1].includes(claims.role)) return redirect(homeFor(claims.role));
  return NextResponse.next();
}

export const config = { matcher: ["/login", "/cadastro", "/trocar-senha", "/admin/:path*", "/recepcao/:path*", "/fisio/:path*", "/app/:path*"] };
