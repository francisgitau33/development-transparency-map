import { type NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

/**
 * Server-side route protection for authenticated dashboard pages.
 *
 * Layer 1 (this file):  fast, edge-safe JWT verification on every
 *                       /dashboard/** request. Missing / invalid sessions
 *                       are redirected to /login before any HTML is streamed.
 *
 * Layer 2 (page / API): role-specific guards (SYSTEM_OWNER-only routes,
 *                       org scoping for PARTNER_ADMIN). Those still live in
 *                       the client layout + API route handlers and are
 *                       intentionally NOT weakened. This middleware only
 *                       adds an additional earlier checkpoint.
 *
 * Notes
 * - jose works in the Next.js edge runtime (no Prisma calls here).
 * - We cannot look up the User / Role record from the DB in edge runtime,
 *   so role gating stays in the existing API / page checks.
 * - Cookie name + JWT secret must stay in sync with src/lib/session.ts.
 */

const SESSION_COOKIE_NAME = "mmdd-session";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "map-my-dev-data-secret-change-in-production",
);

async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only gate /dashboard/** here. Public pages, /login, /register-style routes
  // (/login has a register tab), /pending-approval and /api/* keep their
  // existing behaviour.
  if (!pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const authenticated = await verifySessionToken(token);

  if (!authenticated) {
    const loginUrl = new URL("/login", request.url);
    // Preserve the requested path so we can bounce back after login.
    loginUrl.searchParams.set("redirectTo", pathname);
    const response = NextResponse.redirect(loginUrl);
    // Clear any stale / tampered cookie so the client never thinks it's
    // logged in on subsequent requests.
    if (token) {
      response.cookies.delete(SESSION_COOKIE_NAME);
    }
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};