/**
 * Unit tests for the JWT secret resolver (see Prompt 6 · Part B).
 *
 * Coverage goals:
 *   - In production, missing JWT_SECRET throws a clear configuration error.
 *   - In development, missing JWT_SECRET falls back to the dev value AND
 *     emits exactly one console warning per process.
 *   - When JWT_SECRET is present (any environment), it is used verbatim.
 *   - No client-side NEXT_PUBLIC_JWT_SECRET is consulted or required.
 *
 * Test-isolation notes:
 *   - `jwt-secret.ts` keeps per-process module state (the `warnedAboutFallback`
 *     flag and the cached Uint8Array). We call `vi.resetModules()` before each
 *     test and re-import, which gives every test a clean slate.
 *   - We snapshot process.env keys we touch so other test files are not
 *     affected by leaks.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;

function setEnv(node: string | undefined, secret: string | undefined) {
  // Node coerces any `process.env[x] = undefined` assignment into the literal
  // string "undefined", so we MUST use `delete` to genuinely unset a key.
  const env = process.env as Record<string, string | undefined>;
  if (node === undefined) {
    // biome-ignore lint/performance/noDelete: see comment above — required.
    delete env.NODE_ENV;
  } else {
    env.NODE_ENV = node;
  }
  if (secret === undefined) {
    // biome-ignore lint/performance/noDelete: see comment above — required.
    delete env.JWT_SECRET;
  } else {
    env.JWT_SECRET = secret;
  }
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  setEnv(ORIGINAL_NODE_ENV, ORIGINAL_JWT_SECRET);
  vi.restoreAllMocks();
});

describe("getJwtSecretString", () => {
  it("returns the trimmed JWT_SECRET when one is provided", async () => {
    setEnv("development", "  a-real-and-long-enough-secret-string  ");
    const { getJwtSecretString } = await import("./jwt-secret");
    expect(getJwtSecretString()).toBe("a-real-and-long-enough-secret-string");
  });

  it("falls back to a development value AND warns once when missing in development", async () => {
    setEnv("development", undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { getJwtSecretString } = await import("./jwt-secret");
    const first = getJwtSecretString();
    const second = getJwtSecretString();

    expect(first).toMatch(/dev-secret|DO-NOT-USE-IN-PROD/);
    expect(first.length).toBeGreaterThan(16);
    expect(first).toBe(second);

    // Warning must be emitted, and only once per process.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const msg = String(warnSpy.mock.calls[0]?.[0] ?? "");
    expect(msg).toMatch(/JWT_SECRET/);
    expect(msg).toMatch(/development/i);
  });

  it("falls back when JWT_SECRET is an empty / whitespace-only string", async () => {
    setEnv("development", "   ");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { getJwtSecretString } = await import("./jwt-secret");
    expect(() => getJwtSecretString()).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("throws in production when JWT_SECRET is missing", async () => {
    setEnv("production", undefined);
    const { getJwtSecretString } = await import("./jwt-secret");
    expect(() => getJwtSecretString()).toThrow(/JWT_SECRET.*required/i);
  });

  it("throws in production when JWT_SECRET is whitespace-only", async () => {
    setEnv("production", "   ");
    const { getJwtSecretString } = await import("./jwt-secret");
    expect(() => getJwtSecretString()).toThrow(/JWT_SECRET/i);
  });

  it("uses JWT_SECRET in production when it is set", async () => {
    setEnv("production", "a-real-production-secret-of-good-length");
    const { getJwtSecretString } = await import("./jwt-secret");
    expect(getJwtSecretString()).toBe(
      "a-real-production-secret-of-good-length",
    );
  });

  it("does not consult NEXT_PUBLIC_JWT_SECRET (no client-side secret)", async () => {
    setEnv("development", undefined);
    (process.env as Record<string, string | undefined>).NEXT_PUBLIC_JWT_SECRET =
      "should-not-be-used";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getJwtSecretString } = await import("./jwt-secret");
    const value = getJwtSecretString();
    expect(value).not.toBe("should-not-be-used");
    // biome-ignore lint/performance/noDelete: see setEnv() for rationale.
    delete (process.env as Record<string, string | undefined>)
      .NEXT_PUBLIC_JWT_SECRET;
  });
});

describe("getJwtSecretBytes", () => {
  it("returns a non-empty Uint8Array that round-trips to the string secret", async () => {
    setEnv("development", "round-trippable-secret");
    const { getJwtSecretBytes } = await import("./jwt-secret");
    const bytes = getJwtSecretBytes();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(new TextDecoder().decode(bytes)).toBe("round-trippable-secret");
  });

  it("caches the bytes after the first call", async () => {
    setEnv("development", "cache-check-secret");
    const { getJwtSecretBytes } = await import("./jwt-secret");
    const a = getJwtSecretBytes();
    const b = getJwtSecretBytes();
    expect(a).toBe(b);
  });

  it("throws in production when JWT_SECRET is missing (propagated from getJwtSecretString)", async () => {
    setEnv("production", undefined);
    const { getJwtSecretBytes } = await import("./jwt-secret");
    expect(() => getJwtSecretBytes()).toThrow(/JWT_SECRET/i);
  });
});