/**
 * API tests for /api/analytics.
 *
 * Locks the PARTNER_ADMIN platform-wide-read contract: own-org at any
 * visibility + other orgs' PUBLISHED only. Mirrors the reports-endpoint
 * tests in tests/api/reports.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// ----- Mocks ---------------------------------------------------------------

const mockGetSession = vi.fn();
vi.mock("@/lib/session", () => ({
  getSession: () => mockGetSession(),
}));

const userFindUnique = vi.fn<(args?: unknown) => Promise<unknown>>();
const projectCount = vi.fn<(args?: unknown) => Promise<number>>();
const projectGroupBy =
  vi.fn<(args?: unknown) => Promise<Array<Record<string, unknown>>>>();
const projectAggregate =
  vi.fn<(args?: unknown) => Promise<Record<string, unknown>>>();
const projectFindMany = vi.fn<(args?: unknown) => Promise<unknown[]>>();
const orgCount = vi.fn<(args?: unknown) => Promise<number>>();
const countryFindMany = vi.fn<(args?: unknown) => Promise<unknown[]>>();
const sectorFindMany = vi.fn<(args?: unknown) => Promise<unknown[]>>();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (a: unknown) => userFindUnique(a) },
    project: {
      count: (a: unknown) => projectCount(a),
      groupBy: (a: unknown) => projectGroupBy(a),
      aggregate: (a: unknown) => projectAggregate(a),
      findMany: (a: unknown) => projectFindMany(a),
    },
    organization: { count: (a: unknown) => orgCount(a) },
    referenceCountry: { findMany: (a: unknown) => countryFindMany(a) },
    referenceSector: { findMany: (a: unknown) => sectorFindMany(a) },
  },
}));

import { GET as analyticsGet } from "@/app/api/analytics/route";

function makeReq(url: string): NextRequest {
  return { url } as unknown as NextRequest;
}

/** Extract the where passed to the first project.count call. */
function getProjectWhere(): Record<string, unknown> | undefined {
  const firstArg = projectCount.mock.calls[0]?.[0] as
    | { where?: Record<string, unknown> }
    | undefined;
  return firstArg?.where;
}

function collectOrgIds(where: unknown): string[] {
  const seen: string[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const obj = n as Record<string, unknown>;
    if (typeof obj.organizationId === "string") seen.push(obj.organizationId);
    for (const key of ["AND", "OR", "NOT"]) {
      const arr = obj[key];
      if (Array.isArray(arr)) for (const child of arr) walk(child);
    }
  };
  walk(where);
  return seen;
}

function collectVisibilities(where: unknown): string[] {
  const seen: string[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const obj = n as Record<string, unknown>;
    if (typeof obj.visibility === "string") seen.push(obj.visibility);
    for (const key of ["AND", "OR", "NOT"]) {
      const arr = obj[key];
      if (Array.isArray(arr)) for (const child of arr) walk(child);
    }
  };
  walk(where);
  return seen;
}

beforeEach(() => {
  vi.clearAllMocks();
  projectCount.mockResolvedValue(0);
  projectGroupBy.mockResolvedValue([]);
  projectAggregate.mockResolvedValue({
    _sum: { budgetUsd: 0, targetBeneficiaries: 0 },
  });
  projectFindMany.mockResolvedValue([]);
  orgCount.mockResolvedValue(0);
  countryFindMany.mockResolvedValue([]);
  sectorFindMany.mockResolvedValue([]);
});

describe("GET /api/analytics", () => {
  it("returns PUBLISHED-only fallback when unauthenticated (no crash)", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await analyticsGet(makeReq("https://app.example/api/analytics"));
    expect(res.status).toBe(200);
    // Defensive fallback in report-scope: unauthenticated callers only
    // see PUBLISHED rows in aggregates.
    expect(collectVisibilities(getProjectWhere())).toContain("PUBLISHED");
  });

  it("PARTNER_ADMIN: platform-wide by default with own-org + PUBLISHED guard", async () => {
    mockGetSession.mockResolvedValue({
      userId: "partner-1",
      email: "p@example.com",
      displayName: "P",
    });
    userFindUnique.mockResolvedValue({
      id: "partner-1",
      role: { role: "PARTNER_ADMIN", organizationId: "org-partner" },
    });

    const res = await analyticsGet(makeReq("https://app.example/api/analytics"));
    expect(res.status).toBe(200);
    const where = getProjectWhere();
    expect(collectOrgIds(where)).toContain("org-partner");
    expect(collectVisibilities(where)).toContain("PUBLISHED");
  });

  it("PARTNER_ADMIN: ?organizationId= narrows but retains PUBLISHED guard (cross-org drafts blocked)", async () => {
    mockGetSession.mockResolvedValue({
      userId: "partner-1",
      email: "p@example.com",
      displayName: "P",
    });
    userFindUnique.mockResolvedValue({
      id: "partner-1",
      role: { role: "PARTNER_ADMIN", organizationId: "org-partner" },
    });

    const res = await analyticsGet(
      makeReq("https://app.example/api/analytics?organizationId=peer-org"),
    );
    expect(res.status).toBe(200);
    const where = getProjectWhere();
    expect(collectOrgIds(where)).toContain("peer-org");
    expect(collectOrgIds(where)).toContain("org-partner");
    expect(collectVisibilities(where)).toContain("PUBLISHED");
  });

  it("SYSTEM_OWNER: platform-wide by default with no visibility guard", async () => {
    mockGetSession.mockResolvedValue({
      userId: "owner-1",
      email: "o@example.com",
      displayName: "O",
    });
    userFindUnique.mockResolvedValue({
      id: "owner-1",
      role: { role: "SYSTEM_OWNER", organizationId: null },
    });

    const res = await analyticsGet(makeReq("https://app.example/api/analytics"));
    expect(res.status).toBe(200);
    expect(collectOrgIds(getProjectWhere())).toEqual([]);
    expect(collectVisibilities(getProjectWhere())).toEqual([]);
  });

  it("SYSTEM_OWNER: honours ?organizationId= with no visibility guard", async () => {
    mockGetSession.mockResolvedValue({
      userId: "owner-1",
      email: "o@example.com",
      displayName: "O",
    });
    userFindUnique.mockResolvedValue({
      id: "owner-1",
      role: { role: "SYSTEM_OWNER", organizationId: null },
    });

    const res = await analyticsGet(
      makeReq("https://app.example/api/analytics?organizationId=target-org"),
    );
    expect(res.status).toBe(200);
    const where = getProjectWhere();
    expect(collectOrgIds(where)).toContain("target-org");
    expect(collectVisibilities(where)).toEqual([]);
  });
});