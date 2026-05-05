/**
 * API tests for /api/cms/home — SYSTEM_OWNER-managed homepage hero.
 *
 * Locks in:
 *   - GET returns stored content when a row exists.
 *   - GET falls back to BRANDING defaults when no row exists (public
 *     pages never break because CMS is empty).
 *   - PUT is SYSTEM_OWNER only: 401 anon, 403 PARTNER_ADMIN.
 *   - PUT validates input and returns 400 + details on failure.
 *   - PUT creates a row the first time and updates the existing row
 *     on subsequent calls.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest, NextResponse } from "next/server";

const mockGetSession = vi.fn();
vi.mock("@/lib/session", () => ({
  getSession: () => mockGetSession(),
}));

const mockLogAudit = vi.fn(async () => {});
vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...(args as [])),
  AUDIT_ACTIONS: {
    CMS_HOME_UPDATED: "CMS_HOME_UPDATED",
  },
}));

const userFindUnique = vi.fn<(args?: unknown) => Promise<unknown>>();
const homeFindFirst = vi.fn<(args?: unknown) => Promise<unknown>>();
const homeCreate = vi.fn<(args?: unknown) => Promise<unknown>>();
const homeUpdate = vi.fn<(args?: unknown) => Promise<unknown>>();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (a: unknown) => userFindUnique(a) },
    cmsHome: {
      findFirst: (a: unknown) => homeFindFirst(a),
      create: (a: unknown) => homeCreate(a),
      update: (a: unknown) => homeUpdate(a),
    },
  },
}));

import { GET as getRaw, PUT as putRaw } from "@/app/api/cms/home/route";

type AnyHandler = (req: NextRequest) => Promise<NextResponse>;
const get = getRaw as unknown as AnyHandler;
const put = putRaw as unknown as AnyHandler;

function mockSystemOwner() {
  mockGetSession.mockResolvedValue({ userId: "u-owner" });
  userFindUnique.mockResolvedValue({
    id: "u-owner",
    email: "owner@example.com",
    role: { role: "SYSTEM_OWNER", organizationId: null },
  });
}

function mockPartnerAdmin() {
  mockGetSession.mockResolvedValue({ userId: "u-partner" });
  userFindUnique.mockResolvedValue({
    id: "u-partner",
    email: "partner@example.com",
    role: { role: "PARTNER_ADMIN", organizationId: "p-org" },
  });
}

function mockAnonymous() {
  mockGetSession.mockResolvedValue(null);
}

function makeReq(
  url: string,
  init: { method?: string; body?: unknown } = {},
): NextRequest {
  const req = new Request(url, {
    method: init.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return req as unknown as NextRequest;
}

const STORED = {
  id: "home-1",
  heroTitle: "Stored Title",
  heroSubtitle: "Stored Subtitle",
  heroDescription: "Stored description.",
  primaryCtaLabel: "Explore",
  primaryCtaHref: "/map",
  secondaryCtaLabel: null as string | null,
  secondaryCtaHref: null as string | null,
  updatedAt: new Date("2026-05-06T00:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/cms/home", () => {
  it("returns stored content when a row exists", async () => {
    homeFindFirst.mockResolvedValue(STORED);
    const res = await get(makeReq("http://x/api/cms/home"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { content: Record<string, unknown> };
    expect(body.content).toMatchObject({
      heroTitle: "Stored Title",
      heroSubtitle: "Stored Subtitle",
      heroDescription: "Stored description.",
      primaryCtaLabel: "Explore",
      primaryCtaHref: "/map",
    });
  });

  it("falls back to BRANDING defaults when no row exists", async () => {
    homeFindFirst.mockResolvedValue(null);
    const res = await get(makeReq("http://x/api/cms/home"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { content: Record<string, unknown> };
    expect(body.content.heroTitle).toBeTruthy();
    expect(body.content.heroSubtitle).toBeTruthy();
    expect(body.content.primaryCtaHref).toBe("/map");
  });

  it("returns fallback content even if DB throws", async () => {
    homeFindFirst.mockRejectedValue(new Error("db down"));
    const res = await get(makeReq("http://x/api/cms/home"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { content: Record<string, unknown> };
    expect(body.content.heroTitle).toBeTruthy();
  });
});

describe("PUT /api/cms/home", () => {
  it("rejects anonymous callers with 401", async () => {
    mockAnonymous();
    const res = await put(
      makeReq("http://x/api/cms/home", {
        method: "PUT",
        body: { heroTitle: "T", heroSubtitle: "S" },
      }),
    );
    expect(res.status).toBe(401);
    expect(homeCreate).not.toHaveBeenCalled();
    expect(homeUpdate).not.toHaveBeenCalled();
  });

  it("rejects PARTNER_ADMIN with 403", async () => {
    mockPartnerAdmin();
    const res = await put(
      makeReq("http://x/api/cms/home", {
        method: "PUT",
        body: { heroTitle: "T", heroSubtitle: "S" },
      }),
    );
    expect(res.status).toBe(403);
    expect(homeCreate).not.toHaveBeenCalled();
    expect(homeUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 with details on validation failure", async () => {
    mockSystemOwner();
    const res = await put(
      makeReq("http://x/api/cms/home", {
        method: "PUT",
        body: {
          heroTitle: "",
          heroSubtitle: "S",
          primaryCtaHref: "javascript:alert(1)",
        },
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { details: string[] };
    expect(body.details.length).toBeGreaterThan(0);
    expect(homeCreate).not.toHaveBeenCalled();
    expect(homeUpdate).not.toHaveBeenCalled();
  });

  it("creates a row on first save", async () => {
    mockSystemOwner();
    homeFindFirst.mockResolvedValue(null);
    homeCreate.mockResolvedValue({ ...STORED, id: "home-new" });
    const res = await put(
      makeReq("http://x/api/cms/home", {
        method: "PUT",
        body: {
          heroTitle: "New Title",
          heroSubtitle: "New Subtitle",
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(homeCreate).toHaveBeenCalledTimes(1);
    expect(homeUpdate).not.toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalledTimes(1);
  });

  it("updates the existing row on subsequent saves", async () => {
    mockSystemOwner();
    homeFindFirst.mockResolvedValue(STORED);
    homeUpdate.mockResolvedValue({ ...STORED, heroTitle: "Updated" });
    const res = await put(
      makeReq("http://x/api/cms/home", {
        method: "PUT",
        body: {
          heroTitle: "Updated",
          heroSubtitle: "Subtitle",
          primaryCtaLabel: "Go",
          primaryCtaHref: "/map",
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(homeUpdate).toHaveBeenCalledTimes(1);
    expect(homeCreate).not.toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalledTimes(1);
  });
});