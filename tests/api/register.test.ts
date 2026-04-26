/**
 * API tests for POST /api/auth/register (see Prompt 6 · Part D.2).
 *
 * Coverage:
 *   - CAPTCHA missing-token rejection when HCAPTCHA_SECRET is configured.
 *   - CAPTCHA verify-failure rejection.
 *   - Dev mode without HCAPTCHA_SECRET still allows the Partner Admin
 *     registration to create a PendingAccessRequest (CAPTCHA-disabled path).
 *   - Rate-limit 429 after 10 POSTs from the same IP.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// ----- Mocks ---------------------------------------------------------------

vi.mock("@/lib/session", () => ({
  createSessionToken: vi.fn(async () => "fake-jwt"),
  setSessionCookie: vi.fn(async () => undefined),
}));

const mockFindUserByEmail = vi.fn();
const mockCreateUser = vi.fn();
const mockCreatePendingAccessRequest = vi.fn();
const mockBootstrapSystemOwner = vi.fn();
const mockGetUserAuthState = vi.fn();

vi.mock("@/lib/auth", () => ({
  findUserByEmail: (...a: unknown[]) => mockFindUserByEmail(...a),
  createUser: (...a: unknown[]) => mockCreateUser(...a),
  createPendingAccessRequest: (...a: unknown[]) =>
    mockCreatePendingAccessRequest(...a),
  bootstrapSystemOwner: (...a: unknown[]) => mockBootstrapSystemOwner(...a),
  getUserAuthState: (...a: unknown[]) => mockGetUserAuthState(...a),
}));

// Default mock fetch used by captcha.ts.
function mockCaptchaFetch(success: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success }),
    })),
  );
}

import {
  __resetRateLimitStoreForTests,
  RATE_LIMITS,
} from "@/lib/rate-limit";

import { POST } from "@/app/api/auth/register/route";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_HCAPTCHA_SECRET = process.env.HCAPTCHA_SECRET;

function setEnv(node: string | undefined, secret: string | undefined) {
  if (node === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV;
  else (process.env as Record<string, string | undefined>).NODE_ENV = node;
  if (secret === undefined)
    delete (process.env as Record<string, string | undefined>).HCAPTCHA_SECRET;
  else (process.env as Record<string, string | undefined>).HCAPTCHA_SECRET = secret;
}

function makeReq(body: unknown, ip = "10.0.0.1"): NextRequest {
  return {
    url: "https://app.example/api/auth/register",
    headers: {
      get(name: string) {
        if (name.toLowerCase() === "x-forwarded-for") return ip;
        return null;
      },
    },
    json: async () => body,
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  __resetRateLimitStoreForTests();
  setEnv("development", undefined);
});

describe("POST /api/auth/register — CAPTCHA", () => {
  it("rejects a missing CAPTCHA token when HCAPTCHA_SECRET is configured", async () => {
    setEnv("development", "secret-value");
    mockCaptchaFetch(true); // Not actually called.

    const res = await POST(
      makeReq({
        email: "new@example.com",
        password: "longenough123",
        displayName: "N",
        captchaToken: undefined,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error).toLowerCase()).toMatch(/captcha/);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("rejects a failing CAPTCHA verification", async () => {
    setEnv("development", "secret-value");
    mockCaptchaFetch(false);
    const res = await POST(
      makeReq({
        email: "new@example.com",
        password: "longenough123",
        displayName: "N",
        captchaToken: "bad-token",
      }),
    );
    expect(res.status).toBe(400);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("completes registration in dev with no HCAPTCHA_SECRET (dev-fallback path)", async () => {
    setEnv("development", undefined);
    mockFindUserByEmail.mockResolvedValue(null);
    mockCreateUser.mockResolvedValue({
      id: "u-new",
      email: "new@example.com",
      displayName: "N",
    });

    // Silence the one-time captcha warning.
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await POST(
      makeReq({
        email: "new@example.com",
        password: "longenough123",
        displayName: "N",
        organizationName: "Org",
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.email).toBe("new@example.com");
    expect(body.redirectTo).toBe("/pending-approval");
    expect(mockCreatePendingAccessRequest).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/auth/register — rate limit", () => {
  it("returns 429 after the IP exceeds RATE_LIMITS.register.limit", async () => {
    setEnv("development", undefined);
    mockFindUserByEmail.mockResolvedValue(null);
    mockCreateUser.mockResolvedValue({
      id: "u-x",
      email: "x@example.com",
      displayName: null,
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const body = {
      email: "x@example.com",
      password: "longenough123",
      displayName: "X",
    };

    for (let i = 0; i < RATE_LIMITS.register.limit; i++) {
      const res = await POST(makeReq(body, "198.51.100.77"));
      expect(res.status).not.toBe(429);
    }
    const over = await POST(makeReq(body, "198.51.100.77"));
    expect(over.status).toBe(429);
  });
});

afterAll(() => {
  setEnv(ORIGINAL_NODE_ENV, ORIGINAL_HCAPTCHA_SECRET);
  vi.unstubAllGlobals();
});