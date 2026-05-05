import { type NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecretBytes } from "./lib/jwt-secret";

/**
 * Edge middleware.
 *
 * Responsibilities:
 *
 * 1. Attach an `x-request-id` header to every response. The id is taken
 *    from inbound `x-request-id` or `x-vercel-id` if present, otherwise
 *    generated. The structured logger (`src/lib/logger.ts`) reads the
 *    same header pattern so request traces stitch together end to end.
 *
 * 2. Gate /dashboard/** with a fast edge-safe JWT verification.
 *    Missing / invalid sessions are redirected to /login before any
 *    HTML is streamed. Role-specific checks still live in the page +
 *    API handlers (edge runtime cannot query Prisma). This middleware
 *    only adds an earlier checkpoint.
 *
 * Notes
 * - jose works in the Next.js edge runtime (no Prisma calls here).
 * - Cookie name + JWT secret must stay in sync with src/lib/session.ts.
 */

const SESSION_COOKIE_NAME = "mmdd-session";

function newRequestId(): string {
  // crypto.randomUUID is available in the Next.js edge runtime.
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function resolveRequestId(request: NextRequest): string {
  return (
    request.headers.get("x-request-id") ||
    request.headers.get("x-vercel-id") ||
    newRequestId()
  );
}

async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, getJwtSecretBytes());
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const requestId = resolveRequestId(request);
  const { pathname } = request.nextUrl;

  // Dashboard gate.
  if (pathname.startsWith("/dashboard")) {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const authenticated = await verifySessionToken(token);

    if (!authenticated) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirectTo", pathname);
      const response = NextResponse.redirect(loginUrl);
      response.headers.set("x-request-id", requestId);
      if (token) response.cookies.delete(SESSION_COOKIE_NAME);
      return response;
    }
  }

  // All other requests (and authenticated dashboard requests) pass
  // through with the request id attached. We also forward the id to
  // the downstream handler via the request headers so route code can
  // read it via `headers()`.
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({ request: { headers: forwardedHeaders } });
  response.headers.set("x-request-id", requestId);
  return response;
}

// Match /dashboard/** (auth gate) AND /api/** (to inject x-request-id).
// Static assets are excluded so we don't pay the middleware cost on every
// image / font fetch.
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/:path*",
  ],
};