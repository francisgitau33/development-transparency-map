/**
 * Unit tests for the rate-limit helper (see Prompt 6 · Part B).
 *
 * We treat the module as an opaque fixed-window token bucket. Tests exercise
 * the public surface only:
 *   - `checkRateLimit` allows under-limit requests.
 *   - Separate buckets / keys are counted independently.
 *   - Over-limit requests are refused.
 *   - Refused requests carry enough state (remaining, resetInMs, limit) to
 *     produce a 429 response.
 *   - `rateLimitedResponse` builds a 429 with a neutral message and
 *     `Retry-After` header.
 *   - Window reset behaviour via fake timers.
 *   - `getClientIp` uses x-forwarded-for / x-real-ip fallbacks.
 *
 * `__resetRateLimitStoreForTests` is exported for hermetic isolation between
 * tests inside this file; we call it in `beforeEach`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetRateLimitStoreForTests,
  RATE_LIMITS,
  checkRateLimit,
  getClientIp,
  rateLimitedResponse,
} from "./rate-limit";

beforeEach(() => {
  __resetRateLimitStoreForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows up to `limit` requests in the window", () => {
    for (let i = 0; i < 3; i++) {
      const r = checkRateLimit({
        bucket: "t",
        key: "1.2.3.4",
        limit: 3,
        windowMs: 1000,
      });
      expect(r.success).toBe(true);
      expect(r.remaining).toBe(3 - 1 - i);
      expect(r.limit).toBe(3);
    }
  });

  it("blocks the next request once the limit is exhausted", () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit({ bucket: "t", key: "1.2.3.4", limit: 3, windowMs: 1000 });
    }
    const denied = checkRateLimit({
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

  it("counts distinct keys independently", () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit({ bucket: "t", key: "ip-A", limit: 3, windowMs: 1000 });
    }
    // ip-A is now exhausted. ip-B must still succeed.
    const other = checkRateLimit({
      bucket: "t",
      key: "ip-B",
      limit: 3,
      windowMs: 1000,
    });
    expect(other.success).toBe(true);
    expect(other.remaining).toBe(2);
  });

  it("counts distinct buckets independently", () => {
    for (let i = 0; i < 2; i++) {
      checkRateLimit({
        bucket: "login",
        key: "ip-A",
        limit: 2,
        windowMs: 1000,
      });
    }
    const login = checkRateLimit({
      bucket: "login",
      key: "ip-A",
      limit: 2,
      windowMs: 1000,
    });
    expect(login.success).toBe(false);

    const register = checkRateLimit({
      bucket: "register",
      key: "ip-A",
      limit: 2,
      windowMs: 1000,
    });
    expect(register.success).toBe(true);
  });

  it("resets the window after windowMs has elapsed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 1, 0, 0, 0));

    for (let i = 0; i < 2; i++) {
      checkRateLimit({ bucket: "w", key: "k", limit: 2, windowMs: 1000 });
    }
    const blocked = checkRateLimit({
      bucket: "w",
      key: "k",
      limit: 2,
      windowMs: 1000,
    });
    expect(blocked.success).toBe(false);

    // Advance past the window.
    vi.advanceTimersByTime(1001);
    const allowed = checkRateLimit({
      bucket: "w",
      key: "k",
      limit: 2,
      windowMs: 1000,
    });
    expect(allowed.success).toBe(true);
    expect(allowed.remaining).toBe(1);
  });

  it("RATE_LIMITS preset values match the documented policy", () => {
    // These are the numbers surfaced in the completion report and docs.
    expect(RATE_LIMITS.login).toEqual({ limit: 10, windowMs: 60_000 });
    expect(RATE_LIMITS.register).toEqual({ limit: 10, windowMs: 60_000 });
    expect(RATE_LIMITS.forgotPassword).toEqual({ limit: 3, windowMs: 60_000 });
    expect(RATE_LIMITS.upload).toEqual({ limit: 5, windowMs: 60_000 });
  });
});

describe("rateLimitedResponse", () => {
  it("returns 429 with neutral message and Retry-After header", async () => {
    const res = rateLimitedResponse({
      success: false,
      remaining: 0,
      resetInMs: 4200,
      limit: 5,
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("5");
    expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");

    const body = await res.json();
    expect(body.error).toMatch(/too many requests/i);
    // Must not leak whether an account exists, etc.
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