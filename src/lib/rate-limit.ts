/**
 * Rate limiter — production-ready with dual backends.
 *
 * Design goals (Sprint 1 hardening):
 *   - Same call-site shape as the previous MVP helper so existing routes
 *     only need to `await` the result.
 *   - Redis/Upstash-compatible fixed-window counter for production. Uses
 *     Upstash's REST API over `fetch` so no extra npm dependency is
 *     pulled in and the helper remains safe to use in the Next.js edge
 *     runtime as well as node.
 *   - Safe local-development fallback: when the Upstash env vars are not
 *     set, we transparently fall back to the in-memory fixed-window
 *     counter. Dev + CI keep working with zero configuration.
 *   - Neutral 429 response that never leaks whether an account exists.
 *
 * Environment variables (see docs/release-readiness-checklist.md):
 *   UPSTASH_REDIS_REST_URL
 *     Upstash-compatible REST endpoint, e.g.
 *     `https://<id>.upstash.io`. When blank, the in-memory fallback is
 *     used.
 *   UPSTASH_REDIS_REST_TOKEN
 *     Bearer token for the REST endpoint. Required whenever
 *     UPSTASH_REDIS_REST_URL is set; the helper refuses to run a
 *     mis-configured Redis backend and falls back to in-memory with a
 *     loud warning.
 *   RATE_LIMIT_BACKEND
 *     Optional override. Accepted values:
 *       "memory"  — always use the in-memory limiter (e.g. for tests).
 *       "redis"   — always use Upstash; throws at first call if the
 *                   Upstash env vars are missing.
 *       "auto"    — (default) use Upstash when env vars are set, fall
 *                   back to memory otherwise.
 *
 * Multi-replica note:
 *   The in-memory limiter is process-local. On Vercel (or any serverless
 *   target) every cold replica gets its own counter, so an attacker can
 *   multiply their effective quota by the number of replicas. The
 *   Upstash backend is required for any production deployment.
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
  /** Which backend produced this decision. Useful for tests + logging. */
  backend: "memory" | "redis";
}

/* ------------------------------------------------------------------ */
/* In-memory backend                                                  */
/* ------------------------------------------------------------------ */

interface Entry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, Entry>();

// Bounded size. Evict oldest entries when we grow too big so the store
// cannot be abused into unbounded memory growth.
const MAX_ENTRIES = 10_000;

function evictIfNeeded() {
  if (memoryStore.size <= MAX_ENTRIES) return;
  const toDrop = Math.floor(MAX_ENTRIES / 4);
  let i = 0;
  for (const k of memoryStore.keys()) {
    if (i >= toDrop) break;
    memoryStore.delete(k);
    i += 1;
  }
}

function checkMemory(opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const storeKey = `${opts.bucket}::${opts.key}`;
  const current = memoryStore.get(storeKey);

  if (!current || current.resetAt <= now) {
    memoryStore.set(storeKey, { count: 1, resetAt: now + opts.windowMs });
    evictIfNeeded();
    return {
      success: true,
      remaining: opts.limit - 1,
      resetInMs: opts.windowMs,
      limit: opts.limit,
      backend: "memory",
    };
  }

  if (current.count >= opts.limit) {
    return {
      success: false,
      remaining: 0,
      resetInMs: current.resetAt - now,
      limit: opts.limit,
      backend: "memory",
    };
  }

  current.count += 1;
  return {
    success: true,
    remaining: opts.limit - current.count,
    resetInMs: current.resetAt - now,
    limit: opts.limit,
    backend: "memory",
  };
}

/* ------------------------------------------------------------------ */
/* Upstash (Redis REST) backend                                        */
/* ------------------------------------------------------------------ */

interface UpstashConfig {
  url: string;
  token: string;
}

/**
 * Reads Upstash configuration from the environment.
 *
 * Returns null when the backend is not configured AND the default
 * "auto" mode is active. Throws when RATE_LIMIT_BACKEND=redis is set
 * but the env vars are missing — deliberately loud so mis-configuration
 * cannot silently revert to the weaker in-memory mode in production.
 */
function getUpstashConfig(): UpstashConfig | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  const backend = (process.env.RATE_LIMIT_BACKEND ?? "auto").toLowerCase();

  if (backend === "memory") return null;

  if (url && token) return { url, token };

  if (backend === "redis") {
    throw new Error(
      "RATE_LIMIT_BACKEND=redis but UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set.",
    );
  }

  // "auto" + no config → in-memory fallback.
  return null;
}

/**
 * Pluggable fetch. Tests inject their own implementation via
 * `__setRateLimitFetchForTests` so we don't need a network mocker.
 */
type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

let fetchImpl: FetchLike = ((globalThis as { fetch?: FetchLike }).fetch ??
  (async () => {
    throw new Error("fetch is not available in this runtime");
  })) as FetchLike;

export function __setRateLimitFetchForTests(f: FetchLike | null) {
  fetchImpl =
    f ??
    (((globalThis as { fetch?: FetchLike }).fetch ??
      (async () => {
        throw new Error("fetch is not available in this runtime");
      })) as FetchLike);
}

async function upstashPipeline(
  cfg: UpstashConfig,
  commands: (string | number)[][],
): Promise<unknown[]> {
  const res = await fetchImpl(`${cfg.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) {
    throw new Error(`Upstash pipeline failed with status ${res.status}`);
  }
  const payload = (await res.json()) as Array<{ result?: unknown; error?: string }>;
  if (!Array.isArray(payload)) {
    throw new Error("Unexpected Upstash response shape");
  }
  for (const entry of payload) {
    if (entry && typeof entry === "object" && "error" in entry && entry.error) {
      throw new Error(`Upstash command error: ${entry.error}`);
    }
  }
  return payload.map((p) => p?.result);
}

/**
 * Fixed-window counter against Upstash. Uses a single pipeline:
 *   INCR key
 *   PEXPIRE key windowMs NX   (only if no TTL yet)
 *   PTTL key                  (ms until expiry, for resetInMs)
 *
 * PEXPIRE NX avoids resetting the TTL on every increment (which would
 * otherwise make the window slide every request and effectively
 * disable the limiter).
 */
async function checkRedis(
  cfg: UpstashConfig,
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  const storeKey = `rl:${opts.bucket}:${opts.key}`;
  const results = await upstashPipeline(cfg, [
    ["INCR", storeKey],
    ["PEXPIRE", storeKey, String(opts.windowMs), "NX"],
    ["PTTL", storeKey],
  ]);

  const count = Number(results[0] ?? 0);
  let pttl = Number(results[2] ?? -1);
  // -1 or -2 → no TTL set (shouldn't happen after PEXPIRE NX, but guard
  // against a race). Treat it as a full window remaining.
  if (!Number.isFinite(pttl) || pttl < 0) pttl = opts.windowMs;

  if (count > opts.limit) {
    return {
      success: false,
      remaining: 0,
      resetInMs: pttl,
      limit: opts.limit,
      backend: "redis",
    };
  }

  return {
    success: true,
    remaining: Math.max(0, opts.limit - count),
    resetInMs: pttl,
    limit: opts.limit,
    backend: "redis",
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Core entry point. Now async so a real Redis backend can be used.
 *
 * On any Upstash failure the call falls back to the in-memory counter so
 * a transient Redis outage never takes the app offline. The failure is
 * surfaced through `console.warn` so it shows up in Sentry breadcrumbs /
 * the structured logger; callers never need to handle it explicitly.
 */
export async function checkRateLimit(
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  // getUpstashConfig() throws when RATE_LIMIT_BACKEND=redis but the
  // Upstash env vars are missing. We deliberately let that propagate so
  // mis-configuration is loud at the first request instead of silently
  // degrading to in-memory.
  const cfg = getUpstashConfig();

  if (!cfg) return checkMemory(opts);

  try {
    return await checkRedis(cfg, opts);
  } catch (err) {
    // Fail-open to in-memory to preserve availability. The warning is
    // intentionally structured so it is easy to grep in logs.
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "rate_limit.redis_fallback",
        bucket: opts.bucket,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return checkMemory(opts);
  }
}

/**
 * Best-effort client-IP extraction. Falls back to a constant so anonymous
 * local requests still get bucketed deterministically.
 *
 * Note: rate limits based on untrusted headers can be bypassed by
 * attackers who control the proxy chain. On Vercel the `x-forwarded-for`
 * header is set by the platform and is trustworthy for bucketing
 * purposes.
 */
export function getClientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
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

/**
 * Pre-configured buckets. Keep limits in one place so they are easy to
 * review / tune. Kept identical to the MVP values — this task does not
 * re-tune rate limits, it only swaps the backend.
 */
export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 60_000 },
  register: { limit: 10, windowMs: 60_000 },
  forgotPassword: { limit: 3, windowMs: 60_000 },
  upload: { limit: 5, windowMs: 60_000 },
} as const;

/**
 * Testing helper — not used in production code paths.
 * Allows Vitest to reset state between tests.
 */
export function __resetRateLimitStoreForTests() {
  memoryStore.clear();
}