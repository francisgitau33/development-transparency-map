/**
 * API tests for the three reports endpoints (see Prompt 6 · Part D.4).
 *
 * We focus on the ACCESS CONTROL + ORG SCOPING contract:
 *   - Unauthenticated → 401.
 *   - PARTNER_ADMIN's Prisma query is scoped to their own organisation.
 *   - SYSTEM_OWNER sees platform-wide data by default and can scope via
 *     ?organizationId=.
 *
 * We do NOT re-test the heavy aggregation logic here — pure helpers are
 * covered by src/lib/funding-cliff.test.ts and
 * src/lib/spatial-vulnerability.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// ----- Mocks ---------------------------------------------------------------

const mockGetSession = vi.fn();
vi.mock("@/lib/session", () => ({
  getSession: () => mockGetSession(),
}));

// Vitest mock signatures are kept deliberately permissive — route code
// passes a variety of Prisma-specific option shapes we don't reproduce here.
const userFindUnique = vi.fn<(args?: unknown) => Promise<unknown>>();
const projectFindMany = vi.fn<(args?: unknown) => Promise<unknown[]>>();
const sectorFindMany = vi.fn<(args?: unknown) => Promise<unknown[]>>();
const areaFindMany = vi.fn<(args?: unknown) => Promise<unknown[]>>();
const areaCount = vi.fn<(args?: unknown) => Promise<number>>();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (a: unknown) => userFindUnique(a) },
    project: { findMany: (a: unknown) => projectFindMany(a) },
    referenceSector: { findMany: (a: unknown) => sectorFindMany(a) },
    administrativeArea: {
      findMany: (a: unknown) => areaFindMany(a),
      count: (a: unknown) => areaCount(a),
    },
  },
}));

import { GET as analyticsGet } from "@/app/api/reports/development-analytics/route";
import { GET as spatialGet } from "@/app/api/reports/spatial-vulnerability/route";
import { GET as cliffGet } from "@/app/api/reports/funding-cliffs/route";

function makeReq(url: string): NextRequest {
  return { url } as unknown as NextRequest;
}

function getProjectWhere(): Record<string, unknown> | undefined {
  const firstArg = projectFindMany.mock.calls[0]?.[0] as
    | { where?: Record<string, unknown> }
    | undefined;
  return firstArg?.where;
}

/**
 * Extract every `organizationId` constraint that appears anywhere in a
 * (possibly nested) Prisma where clause — top-level, inside an AND array,
 * or inside an OR array. The route applies role scoping as a separate AND
 * entry that co-exists with any filter-level organizationId, so we verify
 * the role-scope value is present regardless of order.
 */
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

beforeEach(() => {
  vi.clearAllMocks();
  projectFindMany.mockResolvedValue([]);
  sectorFindMany.mockResolvedValue([]);
  areaFindMany.mockResolvedValue([]);
  areaCount.mockResolvedValue(0);
});

// ---------------------------------------------------------------------------
// /api/reports/development-analytics
// ---------------------------------------------------------------------------

describe("GET /api/reports/development-analytics", () => {
  it("returns 401 for anonymous callers", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await analyticsGet(
      makeReq("https://app.example/api/reports/development-analytics"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when user has no role", async () => {
    mockGetSession.mockResolvedValue({ userId: "u", email: "x@x", displayName: null });
    userFindUnique.mockResolvedValue({ id: "u", role: null });
    const res = await analyticsGet(
      makeReq("https://app.example/api/reports/development-analytics"),
    );
    expect(res.status).toBe(401);
  });

  it("scopes PARTNER_ADMIN queries to their own organisation, regardless of override", async () => {
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
      makeReq(
        "https://app.example/api/reports/development-analytics?organizationId=evil-override",
      ),
    );
    expect(res.status).toBe(200);
    const ids = collectOrgIds(getProjectWhere());
    // The partner's own org MUST appear in the WHERE tree — this is the
    // authoritative role-scope constraint. The override may also appear in
    // filter-where (defense-in-depth: empty intersection). What matters is
    // that the partner's org is enforced.
    expect(ids).toContain("org-partner");
  });

  it("returns platform-wide data for SYSTEM_OWNER by default (no org scope)", async () => {
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
      makeReq("https://app.example/api/reports/development-analytics"),
    );
    expect(res.status).toBe(200);
    expect(collectOrgIds(getProjectWhere())).toEqual([]);
  });

  it("honours ?organizationId= for SYSTEM_OWNER", async () => {
    mockGetSession.mockResolvedValue({
      userId: "owner-1",
      email: "o@example.com",
      displayName: "O",
    });
    userFindUnique.mockResolvedValue({
      id: "owner-1",
      role: { role: "SYSTEM_OWNER", organizationId: null },
    });

    await analyticsGet(
      makeReq(
        "https://app.example/api/reports/development-analytics?organizationId=target-org",
      ),
    );
    expect(collectOrgIds(getProjectWhere())).toContain("target-org");
  });
});

// ---------------------------------------------------------------------------
// /api/reports/spatial-vulnerability
// ---------------------------------------------------------------------------

describe("GET /api/reports/spatial-vulnerability", () => {
  it("returns 401 for anonymous callers", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await spatialGet(
      makeReq("https://app.example/api/reports/spatial-vulnerability"),
    );
    expect(res.status).toBe(401);
  });

  it("locks PARTNER_ADMIN to their own organisation", async () => {
    mockGetSession.mockResolvedValue({
      userId: "partner-1",
      email: "p@example.com",
      displayName: "P",
    });
    userFindUnique.mockResolvedValue({
      id: "partner-1",
      role: { role: "PARTNER_ADMIN", organizationId: "org-partner" },
    });
    await spatialGet(
      makeReq(
        "https://app.example/api/reports/spatial-vulnerability?organizationId=evil",
      ),
    );
    expect(collectOrgIds(getProjectWhere())).toContain("org-partner");
  });

  it("includes population-weighted response fields for SYSTEM_OWNER (Prompt 7 · Part F)", async () => {
    mockGetSession.mockResolvedValue({
      userId: "owner-1",
      email: "o@example.com",
      displayName: "O",
    });
    userFindUnique.mockResolvedValue({
      id: "owner-1",
      role: { role: "SYSTEM_OWNER", organizationId: null },
    });
    // Seed one active admin area with a known population + one active
    // project, so downstream per-capita / per-100k calculations fire.
    areaFindMany.mockResolvedValue([
      {
        id: "area-1",
        name: "Kampala District",
        type: "District",
        countryCode: "UG",
        active: true,
        sortOrder: 1,
        estimatedPopulation: 1_000_000,
        populationYear: 2020,
        populationSource: "Mock",
        country: { code: "UG", name: "Uganda" },
      },
    ]);
    projectFindMany.mockResolvedValue([
      {
        id: "p-1",
        sectorKey: "HEALTH",
        status: "ACTIVE",
        budgetUsd: 500_000,
        targetBeneficiaries: 50_000,
        startDate: new Date(Date.UTC(2024, 0, 1)),
        endDate: new Date(Date.UTC(2026, 11, 31)),
        administrativeAreaId: "area-1",
        donorId: null,
        countryCode: "UG",
      },
    ]);
    sectorFindMany.mockResolvedValue([]);
    areaCount.mockResolvedValue(0);

    const res = await spatialGet(
      makeReq("https://app.example/api/reports/spatial-vulnerability"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    // Shape assertions — new population response keys.
    expect(body).toHaveProperty("investmentPerCapitaByArea");
    expect(body).toHaveProperty("projectsPer100kByArea");
    expect(body).toHaveProperty("beneficiaryReachByArea");
    expect(body).toHaveProperty("beneficiaryReachHasOver100");
    expect(body).toHaveProperty("highPopulationLowCoverageWatchlist");
    expect(body).toHaveProperty("populationQuartiles");

    // Data quality block carries population completeness metrics.
    const dq = body.dataQuality as Record<string, unknown>;
    expect(dq).toHaveProperty("areasWithPopulation");
    expect(dq).toHaveProperty("areasMissingPopulation");
    expect(dq).toHaveProperty("populationCompletenessPercent");
    expect(dq).toHaveProperty("populationYearMin");
    expect(dq).toHaveProperty("populationYearMax");
    expect(dq).toHaveProperty("missingPopulationByCountry");

    // Neutral interpretation notes must be present.
    const notes = body.notes as string[];
    expect(
      notes.some((n) => /Population-adjusted metrics compare/i.test(n)),
    ).toBe(true);
    expect(
      notes.some((n) =>
        /Population-weighted metrics depend on estimated population/i.test(n),
      ),
    ).toBe(true);

    // Investment per capita for the seeded row = 500_000 / 1_000_000 = 0.5.
    const ipcRows = body.investmentPerCapitaByArea as Array<
      Record<string, unknown>
    >;
    expect(ipcRows.length).toBe(1);
    const ipcCell = ipcRows[0].investmentPerCapita as Record<string, unknown>;
    expect(ipcCell.value).toBeCloseTo(0.5, 5);
    expect(ipcCell.label).toBeNull();

    // Population completeness for one populated area should be 100%.
    expect(dq.areasWithPopulation).toBe(1);
    expect(dq.areasMissingPopulation).toBe(0);
    expect(dq.populationCompletenessPercent).toBe(100);
  });

  it("renders missing-population labels when the area has no population (Prompt 7 · Part F rules)", async () => {
    mockGetSession.mockResolvedValue({
      userId: "owner-1",
      email: "o@example.com",
      displayName: "O",
    });
    userFindUnique.mockResolvedValue({
      id: "owner-1",
      role: { role: "SYSTEM_OWNER", organizationId: null },
    });
    areaFindMany.mockResolvedValue([
      {
        id: "area-1",
        name: "Gulu District",
        type: "District",
        countryCode: "UG",
        active: true,
        sortOrder: 2,
        estimatedPopulation: null,
        populationYear: null,
        populationSource: null,
        country: { code: "UG", name: "Uganda" },
      },
    ]);
    projectFindMany.mockResolvedValue([]);
    sectorFindMany.mockResolvedValue([]);
    areaCount.mockResolvedValue(0);

    const res = await spatialGet(
      makeReq("https://app.example/api/reports/spatial-vulnerability"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    const ipcRows = body.investmentPerCapitaByArea as Array<
      Record<string, unknown>
    >;
    const cell = ipcRows[0].investmentPerCapita as Record<string, unknown>;
    expect(cell.value).toBeNull();
    expect(cell.label).toBe("Population data missing");

    const dq = body.dataQuality as Record<string, unknown>;
    expect(dq.areasWithPopulation).toBe(0);
    expect(dq.areasMissingPopulation).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// /api/reports/funding-cliffs
// ---------------------------------------------------------------------------

describe("GET /api/reports/funding-cliffs", () => {
  it("returns 401 for anonymous callers", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await cliffGet(
      makeReq("https://app.example/api/reports/funding-cliffs"),
    );
    expect(res.status).toBe(401);
  });

  it("locks PARTNER_ADMIN to their own organisation", async () => {
    mockGetSession.mockResolvedValue({
      userId: "partner-1",
      email: "p@example.com",
      displayName: "P",
    });
    userFindUnique.mockResolvedValue({
      id: "partner-1",
      role: { role: "PARTNER_ADMIN", organizationId: "org-partner" },
    });
    await cliffGet(
      makeReq(
        "https://app.example/api/reports/funding-cliffs?organizationId=evil",
      ),
    );
    expect(collectOrgIds(getProjectWhere())).toContain("org-partner");
  });

  it("honours ?organizationId= for SYSTEM_OWNER", async () => {
    mockGetSession.mockResolvedValue({
      userId: "owner-1",
      email: "o@example.com",
      displayName: "O",
    });
    userFindUnique.mockResolvedValue({
      id: "owner-1",
      role: { role: "SYSTEM_OWNER", organizationId: null },
    });
    await cliffGet(
      makeReq(
        "https://app.example/api/reports/funding-cliffs?organizationId=target-org",
      ),
    );
    expect(collectOrgIds(getProjectWhere())).toContain("target-org");
  });
});