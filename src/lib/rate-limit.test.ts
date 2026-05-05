/**
 * Unit tests for the rate-limit helper (Sprint 1 hardening).
 *
 * Coverage:
 *   - In-memory path:
 *     - `checkRateLimit` allows under-limit requests
 *     - Separate buckets / keys are counted independently
 *     - Over-limit requests are refused (success=false, resetInMs>0)
 *     - Window reset behaviour under fake timers
 *   - Upstash REST path:
 *     - Allowed when count ≤ limit
 *     - Blocked when count > limit
 *     - Backend is reported as "redis"
 *   - Fallback path:
 *     - When Upstash `fetch` throws, the limiter falls back to in-memory
 *       and the call still returns a decision (does NOT throw)
 *   - `rateLimitedResponse` returns a 429 with neutral wording +
 *     `Retry-After` header, never leaks account existence
 *   - `getClientIp` uses x-forwarded-for / x-real-ip fallbacks
 *
 * `__resetRateLimitStoreForTests` and `__setRateLimitFetchForTests` are
 * exported for hermetic isolation between tests; we call them in
 * `beforeEach` / `afterEach`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetRateLimitStoreForTests,
  __setRateLimitFetchForTests,
  RATE_LIMITS,
  checkRateLimit,
  getClientIp,
  rateLimitedResponse,
} from "./rate-limit";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  __resetRateLimitStoreForTests();
  __setRateLimitFetchForTests(null);
  // Default to "memory" backend for the in-memory tests.
  process.env.RATE_LIMIT_BACKEND = "memory";
  process.env.UPSTASH_REDIS_REST_URL = "";
  process.env.UPSTASH_REDIS_REST_TOKEN = "";
});

afterEach(() => {
  vi.useRealTimers();
  // Restore env so we don't leak between files.
  for (const k of Object.keys(process.env)) {
    if (!(k in ORIGINAL_ENV)) process.env[k] = "";
  }
  Object.assign(process.env, ORIGINAL_ENV);
});

describe("checkRateLimit (in-memory)", () => {
  it("allows up to `limit` requests in the window", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await checkRateLimit({
        bucket: "t",
        key: "1.2.3.4",
        limit: 3,
        windowMs: 1000,
      });
      expect(r.success).toBe(true);
      expect(r.remaining).toBe(3 - 1 - i);
      expect(r.limit).toBe(3);
      expect(r.backend).toBe("memory");
    }
  });

  it("blocks the next request once the limit is exhausted", async () => {
    for (let i = 0; i < 3; i++) {
      await checkRateLimit({
        bucket: "t",
        key: "1.2.3.4",
        limit: 3,
        windowMs: 1000,
      });
    }
    const denied = await checkRateLimit({
      bucket: "t",
      key: "1.2.3.4",
      limit: 3,
      windowMs: 1000,
    });
    expect(denied.success).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.resetInMs).toBeGreaterThan(0);
    expect(denied.limit).toBe(3);
  });

  it("counts distinct keys independently", async () => {
    for (let i = 0; i < 3; i++) {
      await checkRateLimit({
        bucket: "t",
        key: "ip-A",
        limit: 3,
        windowMs: 1000,
      });
    }
    const other = await checkRateLimit({
      bucket: "t",
      key: "ip-B",
      limit: 3,
      windowMs: 1000,
    });
    expect(other.success).toBe(true);
    expect(other.remaining).toBe(2);
  });

  it("counts distinct buckets independently", async () => {
    for (let i = 0; i < 2; i++) {
      await checkRateLimit({
        bucket: "login",
        key: "ip-A",
        limit: 2,
        windowMs: 1000,
      });
    }
    const login = await checkRateLimit({
      bucket: "login",
      key: "ip-A",
      limit: 2,
      windowMs: 1000,
    });
    expect(login.success).toBe(false);

    const register = await checkRateLimit({
      bucket: "register",
      key: "ip-A",
      limit: 2,
      windowMs: 1000,
    });
    expect(register.success).toBe(true);
  });

  it("resets the window after windowMs has elapsed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 1, 0, 0, 0));

    for (let i = 0; i < 2; i++) {
      await checkRateLimit({ bucket: "w", key: "k", limit: 2, windowMs: 1000 });
    }
    const blocked = await checkRateLimit({
      bucket: "w",
      key: "k",
      limit: 2,
      windowMs: 1000,
    });
    expect(blocked.success).toBe(false);

    vi.advanceTimersByTime(1001);
    const allowed = await checkRateLimit({
      bucket: "w",
      key: "k",
      limit: 2,
      windowMs: 1000,
    });
    expect(allowed.success).toBe(true);
    expect(allowed.remaining).toBe(1);
  });

  it("RATE_LIMITS preset values match the documented policy", () => {
    expect(RATE_LIMITS.login).toEqual({ limit: 10, windowMs: 60_000 });
    expect(RATE_LIMITS.register).toEqual({ limit: 10, windowMs: 60_000 });
    expect(RATE_LIMITS.forgotPassword).toEqual({ limit: 3, windowMs: 60_000 });
    expect(RATE_LIMITS.upload).toEqual({ limit: 5, windowMs: 60_000 });
  });
});

describe("checkRateLimit (Upstash REST)", () => {
  beforeEach(() => {
    process.env.RATE_LIMIT_BACKEND = "auto";
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  });

  it("allows a request when the Upstash counter is within the limit", async () => {
    const calls: Array<{ input: string; body: unknown }> = [];
    __setRateLimitFetchForTests(async (input, init) => {
      calls.push({ input, body: init?.body ? JSON.parse(init.body) : null });
      return {
        ok: true,
        status: 200,
        json: async () => [
          { result: 2 }, // INCR → count = 2
          { result: 1 }, // PEXPIRE NX
          { result: 58_000 }, // PTTL in ms
        ],
      };
    });

    const r = await checkRateLimit({
      bucket: "login",
      key: "ip-A",
      limit: 5,
      windowMs: 60_000,
    });
    expect(r.success).toBe(true);
    expect(r.backend).toBe("redis");
    expect(r.remaining).toBe(3);
    expect(r.resetInMs).toBe(58_000);

    // Sanity-check the pipeline shape.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe("https://example.upstash.io/pipeline");
    expect(calls[0]?.body).toEqual([
      ["INCR", "rl:login:ip-A"],
      ["PEXPIRE", "rl:login:ip-A", "60000", "NX"],
      ["PTTL", "rl:login:ip-A"],
    ]);
  });

  it("blocks a request once the Upstash counter exceeds the limit", async () => {
    __setRateLimitFetchForTests(async () => ({
      ok: true,
      status: 200,
      json: async () => [{ result: 11 }, { result: 0 }, { result: 42_000 }],
    }));

    const r = await checkRateLimit({
      bucket: "login",
      key: "ip-A",
      limit: 10,
      windowMs: 60_000,
    });
    expect(r.success).toBe(false);
    expect(r.backend).toBe("redis");
    expect(r.remaining).toBe(0);
    expect(r.resetInMs).toBe(42_000);
  });

  it("falls back to in-memory when Upstash fetch fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    __setRateLimitFetchForTests(async () => {
      throw new Error("network unreachable");
    });

    const r = await checkRateLimit({
      bucket: "login",
      key: "ip-A",
      limit: 2,
      windowMs: 1000,
    });
    expect(r.success).toBe(true);
    expect(r.backend).toBe("memory");
    expect(r.remaining).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    // Warn payload must not include the raw request body or any secret.
    const warnArg = String(warn.mock.calls[0]?.[0] ?? "");
    expect(warnArg).toMatch(/rate_limit.redis_fallback/);
    expect(warnArg).not.toMatch(/test-token/);

    warn.mockRestore();
  });

  it("RATE_LIMIT_BACKEND=redis without env vars throws immediately", async () => {
    process.env.RATE_LIMIT_BACKEND = "redis";
    process.env.UPSTASH_REDIS_REST_URL = "";
    process.env.UPSTASH_REDIS_REST_TOKEN = "";

    await expect(
      checkRateLimit({
        bucket: "login",
        key: "ip-A",
        limit: 5,
        windowMs: 60_000,
      }),
    ).rejects.toThrow(/RATE_LIMIT_BACKEND=redis/);
  });
});

describe("rateLimitedResponse", () => {
  it("returns 429 with neutral message and Retry-After header", async () => {
    const res = rateLimitedResponse({
      success: false,
      remaining: 0,
      resetInMs: 4200,
      limit: 5,
      backend: "memory",
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("5");
    expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");

    const body = await res.json();
    expect(body.error).toMatch(/too many requests/i);
    expect(String(body.error).toLowerCase()).not.toMatch(
      /email|account|user|password|login|register/,
    );
  });

  it("clamps Retry-After to at least 1 second", async () => {
    const res = rateLimitedResponse({
      success: false,
      remaining: 0,
      resetInMs: 1,
      limit: 5,
      backend: "memory",
    });
    expect(res.headers.get("Retry-After")).toBe("1");
  });
});

describe("getClientIp", () => {
  function makeReq(headers: Record<string, string>) {
    return {
      headers: {
        get(name: string) {
          return headers[name.toLowerCase()] ?? null;
        },
      },
    } as unknown as Parameters<typeof getClientIp>[0];
  }

  it("uses the first x-forwarded-for entry", () => {
    const ip = getClientIp(
      makeReq({ "x-forwarded-for": "203.0.113.5, 10.0.0.1, 10.0.0.2" }),
    );
    expect(ip).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const ip = getClientIp(makeReq({ "x-real-ip": "198.51.100.9" }));
    expect(ip).toBe("198.51.100.9");
  });

  it("returns 'unknown' when no forwarding headers are present", () => {
    const ip = getClientIp(makeReq({}));
    expect(ip).toBe("unknown");
  });
});