import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/session-token";
import { isLocalAuth } from "@/lib/standalone";

/**
 * The sign-in gate (Studio Review plan, Phase 0). An optimistic check only: a request without a
 * session cookie goes to sign-in. `getCurrentMember()` is the real check, so a forged or expired
 * cookie still ends at sign-in, and a Server Action posted to a public path still needs it.
 */
const PUBLIC = [
  /^\/review(\/|$)/, // Studio Review room: share token + passcode
  /^\/r\//, // short-video review link: the token is the credential
  /^\/c\//, // client portal link
  /^\/sign-in(\/|$)/,
  /^\/api\/health$/,
  /^\/api\/v1(\/|$)/, // assistant API: bearer token, checked per request
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  if (isLocalAuth() || request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  return NextResponse.redirect(new URL("/sign-in", request.url));
}

export const config = {
  // Everything but build output and the files in public/.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|[\\w-]+\\.svg$).*)"],
};
