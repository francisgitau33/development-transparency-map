/**
 * Unit tests for the hCaptcha verification helper (see Prompt 6 · Part B).
 *
 * We do NOT call hCaptcha. `fetch` is mocked per test so the behaviour is
 * exercised deterministically:
 *   - Dev + no HCAPTCHA_SECRET → verification is skipped (ok: true).
 *   - Prod + no HCAPTCHA_SECRET → refused with reason "not-configured-production".
 *   - Missing / empty token → rejected with "missing-token".
 *   - hCaptcha responds success=false → rejected with "verification-failed".
 *   - hCaptcha responds success=true → accepted.
 *   - hCaptcha non-2xx HTTP → rejected with "verification-failed".
 *   - Fetch throwing → rejected (fail-closed) with "verification-failed".
 *
 * Test isolation:
 *   - The module has a one-per-process "warned about missing secret" flag.
 *     We call `vi.resetModules()` between tests and re-import to reset it.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_HCAPTCHA_SECRET = process.env.HCAPTCHA_SECRET;

function setEnv(node: string | undefined, secret: string | undefined) {
  // Node coerces any `process.env[x] = undefined` into the literal string
  // "undefined", so we MUST use `delete` to truly unset a key.
  const env = process.env as Record<string, string | undefined>;
  if (node === undefined) {
    // biome-ignore lint/performance/noDelete: see rationale above.
    delete env.NODE_ENV;
  } else {
    env.NODE_ENV = node;
  }
  if (secret === undefined) {
    // biome-ignore lint/performance/noDelete: see rationale above.
    delete env.HCAPTCHA_SECRET;
  } else {
    env.HCAPTCHA_SECRET = secret;
  }
}

function mockFetchJson(body: unknown, ok = true, status = 200): Mock {
  const fn = vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  }));
  vi.stubGlobal("fetch", fn);
  return fn as unknown as Mock;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  setEnv(ORIGINAL_NODE_ENV, ORIGINAL_HCAPTCHA_SECRET);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isCaptchaConfigured", () => {
  it("returns false when HCAPTCHA_SECRET is unset", async () => {
    setEnv("development", undefined);
    const { isCaptchaConfigured } = await import("./captcha");
    expect(isCaptchaConfigured()).toBe(false);
  });

  it("returns false when HCAPTCHA_SECRET is whitespace-only", async () => {
    setEnv("development", "   ");
    const { isCaptchaConfigured } = await import("./captcha");
    expect(isCaptchaConfigured()).toBe(false);
  });

  it("returns true when HCAPTCHA_SECRET is a non-empty string", async () => {
    setEnv("development", "some-secret");
    const { isCaptchaConfigured } = await import("./captcha");
    expect(isCaptchaConfigured()).toBe(true);
  });
});

describe("verifyCaptchaToken — not configured", () => {
  it("accepts the request in development and warns once", async () => {
    setEnv("development", undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { verifyCaptchaToken } = await import("./captcha");

    const a = await verifyCaptchaToken("anything");
    const b = await verifyCaptchaToken(undefined);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    // Verify endpoint was never called.
    expect(fetchSpy).not.toHaveBeenCalled();
    // Warning was emitted at most once.
    expect(warnSpy.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("refuses in production when HCAPTCHA_SECRET is missing", async () => {
    setEnv("production", undefined);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { verifyCaptchaToken } = await import("./captcha");
    const res = await verifyCaptchaToken("any-token");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("not-configured-production");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("verifyCaptchaToken — configured", () => {
  it("rejects a missing or empty token without calling hCaptcha", async () => {
    setEnv("development", "secret");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { verifyCaptchaToken } = await import("./captcha");

    const a = await verifyCaptchaToken(undefined);
    const b = await verifyCaptchaToken("");
    const c = await verifyCaptchaToken("   ");

    for (const r of [a, b, c]) {
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("missing-token");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("accepts a valid hCaptcha success response", async () => {
    setEnv("development", "secret");
    const fetchSpy = mockFetchJson({ success: true });

    const { verifyCaptchaToken } = await import("./captcha");
    const res = await verifyCaptchaToken("good-token", "203.0.113.5");
    expect(res.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Inspect the call: URL + body.
    const [url, init] = fetchSpy.mock.calls[0] as [
      string,
      { method: string; body: string; headers: Record<string, string> },
    ];
    expect(String(url)).toContain("hcaptcha.com/siteverify");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toContain("secret=secret");
    expect(String(init.body)).toContain("response=good-token");
    expect(String(init.body)).toContain("remoteip=203.0.113.5");
  });

  it("rejects an unsuccessful hCaptcha response and preserves error codes", async () => {
    setEnv("development", "secret");
    mockFetchJson({
      success: false,
      "error-codes": ["invalid-input-response"],
    });

    const { verifyCaptchaToken } = await import("./captcha");
    const res = await verifyCaptchaToken("bad-token");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("verification-failed");
    expect(res.errorCodes).toEqual(["invalid-input-response"]);
  });

  it("rejects when hCaptcha returns a non-2xx status", async () => {
    setEnv("development", "secret");
    mockFetchJson({}, false, 502);

    const { verifyCaptchaToken } = await import("./captcha");
    const res = await verifyCaptchaToken("a-token");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("verification-failed");
    expect(res.errorCodes?.[0]).toBe("http_502");
  });

  it("fails closed when fetch throws", async () => {
    setEnv("development", "secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { verifyCaptchaToken } = await import("./captcha");
    const res = await verifyCaptchaToken("a-token");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("verification-failed");
  });
});