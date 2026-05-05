/**
 * Unit tests for the structured logger.
 *
 * Coverage:
 *   - `redact` replaces secret-like keys at every nesting depth.
 *   - `redact` never returns the original password, token, cookie, or
 *     authorization header even if those are nested inside arrays.
 *   - `body` / `requestBody` / `rawBody` keys are redacted wholesale
 *     (we NEVER log raw request bodies).
 *   - `logger.info / warn / error` emit a single JSON line with the
 *     expected shape.
 *   - `logger.error` output does not contain any secret string that
 *     was passed in via the `ctx` or `error` fields.
 *   - `newRequestId` / `getOrCreateRequestId` return stable values.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetLoggerForTests,
  getOrCreateRequestId,
  logger,
  newRequestId,
  redact,
} from "./logger";

beforeEach(() => {
  __resetLoggerForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("redact", () => {
  it("redacts password, token, secret, and cookie keys", () => {
    const out = redact({
      email: "user@example.com",
      password: "hunter2",
      currentPassword: "old",
      newPassword: "new",
      resetToken: "abc.def",
      captchaToken: "xyz",
      jwtSecret: "s",
      stripeSecretKey: "sk_test_123",
      authorization: "Bearer 1234",
      cookie: "mmdd-session=xyz",
      nested: {
        apiKey: "ak_live_1",
        api_key: "k",
        resetLink: "https://example.org/reset?token=t",
      },
    }) as Record<string, unknown>;

    expect(out.email).toBe("user@example.com");
    expect(out.password).toBe("[REDACTED]");
    expect(out.currentPassword).toBe("[REDACTED]");
    expect(out.newPassword).toBe("[REDACTED]");
    expect(out.resetToken).toBe("[REDACTED]");
    expect(out.captchaToken).toBe("[REDACTED]");
    expect(out.jwtSecret).toBe("[REDACTED]");
    expect(out.stripeSecretKey).toBe("[REDACTED]");
    expect(out.authorization).toBe("[REDACTED]");
    expect(out.cookie).toBe("[REDACTED]");
    const nested = out.nested as Record<string, unknown>;
    expect(nested.apiKey).toBe("[REDACTED]");
    expect(nested.api_key).toBe("[REDACTED]");
    expect(nested.resetLink).toBe("[REDACTED]");
  });

  it("redacts `body` / `requestBody` / `rawBody` wholesale", () => {
    const out = redact({
      body: { email: "a@b.c", password: "p" },
      requestBody: "raw",
      rawBody: "buffer",
    }) as Record<string, unknown>;

    expect(out.body).toBe("[REDACTED]");
    expect(out.requestBody).toBe("[REDACTED]");
    expect(out.rawBody).toBe("[REDACTED]");
  });

  it("redacts secrets at every nesting depth, including inside arrays", () => {
    const out = redact({
      users: [
        { id: "1", password: "p1" },
        { id: "2", password: "p2", token: "t2" },
      ],
    });
    const serialized = JSON.stringify(out);
    expect(serialized).not.toMatch(/p1|p2|t2/);
    expect(serialized).toMatch(/\[REDACTED\]/);
  });

  it("handles circular references without throwing", () => {
    const o: Record<string, unknown> = { a: 1 };
    o.self = o;
    expect(() => redact(o)).not.toThrow();
  });

  it("serialises Error objects as { name, message, stack }", () => {
    const err = new Error("boom");
    const out = redact(err) as { name: string; message: string; stack?: string };
    expect(out.name).toBe("Error");
    expect(out.message).toBe("boom");
    expect(typeof out.stack === "string" || out.stack === undefined).toBe(true);
  });
});

describe("logger.error", () => {
  it("emits a single JSON line with level=error and redacted ctx", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error({
      event: "login.failed",
      msg: "bad credentials",
      requestId: "rid-1",
      ctx: {
        email: "user@example.com",
        password: "secret-should-not-leak",
      },
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0]?.[0] as string;
    expect(typeof line).toBe("string");
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe("error");
    expect(parsed.event).toBe("login.failed");
    expect(parsed.msg).toBe("bad credentials");
    expect(parsed.requestId).toBe("rid-1");
    expect(parsed.ctx.email).toBe("user@example.com");
    expect(parsed.ctx.password).toBe("[REDACTED]");
    // CRITICAL: the raw secret must not appear anywhere in the line.
    expect(line).not.toContain("secret-should-not-leak");
  });

  it("serialises thrown errors without leaking their nested secrets", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new Error("db connection refused"), {
      // Some libraries attach the request config (including Authorization)
      // to thrown errors. The logger must still redact it.
      config: { headers: { Authorization: "Bearer leaked-bearer-token" } },
    });
    logger.error({ event: "db.connect_failed", error: err });

    const line = spy.mock.calls[0]?.[0] as string;
    // We still include the error class / message.
    expect(line).toContain("db connection refused");
    // But the bearer token must not survive.
    expect(line).not.toContain("leaked-bearer-token");
  });
});

describe("logger.info / warn", () => {
  it("uses console.log for info and console.warn for warn", () => {
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logger.info({ event: "boot", msg: "hello" });
    logger.warn({ event: "slow.query", ctx: { ms: 1200 } });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    const warnLine = JSON.parse(warnSpy.mock.calls[0]?.[0] as string);
    expect(warnLine.level).toBe("warn");
    expect(warnLine.event).toBe("slow.query");
    expect(warnLine.ctx.ms).toBe(1200);
  });
});

describe("request id helpers", () => {
  it("newRequestId returns a non-empty string", () => {
    const id = newRequestId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("getOrCreateRequestId prefers x-request-id over x-vercel-id", () => {
    const h = new Headers();
    h.set("x-request-id", "inbound-123");
    h.set("x-vercel-id", "vercel-456");
    expect(getOrCreateRequestId(h)).toBe("inbound-123");
  });

  it("getOrCreateRequestId falls back to x-vercel-id", () => {
    const h = new Headers();
    h.set("x-vercel-id", "vercel-456");
    expect(getOrCreateRequestId(h)).toBe("vercel-456");
  });

  it("getOrCreateRequestId generates a new id when no header is present", () => {
    const h = new Headers();
    const id = getOrCreateRequestId(h);
    expect(id.length).toBeGreaterThan(0);
  });
});