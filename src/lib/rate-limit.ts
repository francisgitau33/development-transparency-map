/**
 * In-memory token-bucket / fixed-window rate limiter.
 *
 * MVP scope (see Prompt 5 · Part B):
 *   - Process-local, in-memory store. Acceptable for current single-instance
 *     deployment. In a multi-replica deployment this must be swapped for a
 *     shared store (Redis / Upstash). The call sites do NOT need to change.
 *   - Uses fixed windows per (bucket, key). `key` is typically the client IP
 *     for anonymous routes or the user ID for authenticated routes.
 *   - Returns an object that callers can use to build a 429 response with
 *     neutral wording. It never leaks details that could help an attacker
 *     enumerate valid accounts or emails.
 */
import { type NextRequest, NextResponse } from "next/server";

export interface RateLimitOptions {
  /** Identifier of the limiter (e.g. "login", "register"). */
  bucket: string;
  /** Identifier of the subject (ip or userId). */
  key: string;
  /** Maximum requests allowed in the window. */
  limit: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  success: boolean;
  /** Remaining requests in the current window. */
  remaining: number;
  /** Milliseconds until the current window resets. */
  resetInMs: number;
  /** Total limit. */
  limit: number;
}

interface Entry {
  count: number;
  resetAt: number;
}

// Module-level store. Keyed by `${bucket}::${key}`.
const store = new Map<string, Entry>();

// Bounded size. Evict oldest entries when we grow too big so the store
// cannot be abused into unbounded memory growth.
const MAX_ENTRIES = 10_000;

function evictIfNeeded() {
  if (store.size <= MAX_ENTRIES) return;
  // Drop the oldest quarter by insertion order (Map preserves it).
  const toDrop = Math.floor(MAX_ENTRIES / 4);
  let i = 0;
  for (const k of store.keys()) {
    if (i >= toDrop) break;
    store.delete(k);
    i += 1;
  }
}

export function checkRateLimit(opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const storeKey = `${opts.bucket}::${opts.key}`;
  const current = store.get(storeKey);

  if (!current || current.resetAt <= now) {
    store.set(storeKey, { count: 1, resetAt: now + opts.windowMs });
    evictIfNeeded();
    return {
      success: true,
      remaining: opts.limit - 1,
      resetInMs: opts.windowMs,
      limit: opts.limit,
    };
  }

  if (current.count >= opts.limit) {
    return {
      success: false,
      remaining: 0,
      resetInMs: current.resetAt - now,
      limit: opts.limit,
    };
  }

  current.count += 1;
  return {
    success: true,
    remaining: opts.limit - current.count,
    resetInMs: current.resetAt - now,
    limit: opts.limit,
  };
}

/**
 * Best-effort client-IP extraction. Falls back to a constant so anonymous
 * local requests still get bucketed deterministically.
 *
 * Note: rate limits based on untrusted headers can be bypassed by attackers
 * who control the proxy chain, but for MVP this is acceptable and avoids
 * breaking deployments behind reverse proxies.
 */
export function getClientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    // First entry is typically the originating client.
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  // NextRequest.ip is not stable across runtimes; fall through.
  return "unknown";
}

/**
 * Standard 429 response. Callers should `return` this directly.
 *
 * The user-facing message is deliberately neutral — it must not leak
 * whether the underlying account / email exists.
 */
export function rateLimitedResponse(result: RateLimitResult): NextResponse {
  const retryAfterSeconds = Math.max(1, Math.ceil(result.resetInMs / 1000));
  return NextResponse.json(
    { error: "Too many requests. Please try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}

// Pre-configured buckets. Keep limits in one place so they are easy to
// review / tune.
export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 60_000 },
  register: { limit: 10, windowMs: 60_000 },
  forgotPassword: { limit: 3, windowMs: 60_000 },
  upload: { limit: 5, windowMs: 60_000 },
} as const;

/**
 * Testing helper — not used in production code paths.
 * Allows Jest/Vitest to reset state between tests.
 */
export function __resetRateLimitStoreForTests() {
  store.clear();
}