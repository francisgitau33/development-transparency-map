/**
 * API tests for POST /api/upload (see Prompt 6 · Part D.3).
 *
 * Scope (pre-row validation surface only — the bulk-insert path is exercised
 * by the manual smoke tests from Prompt 5):
 *   - Unauthenticated → 401.
 *   - Missing required CSV headers → 400 with `missingHeaders` array.
 *   - More than MAX_UPLOAD_ROWS rows → 413.
 *   - Rate limit exhaustion → 429.
 *   - PARTNER_ADMIN may NOT override the organisation scope.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// ----- Mocks ---------------------------------------------------------------

const mockGetSession = vi.fn();
vi.mock("@/lib/session", () => ({
  getSession: () => mockGetSession(),
}));

const userFindUnique = vi.fn<(a: unknown) => Promise<unknown>>();
const orgFindUnique = vi.fn<(a: unknown) => Promise<unknown>>();
const countryFindMany = vi.fn<(a?: unknown) => Promise<unknown[]>>();
const sectorFindMany = vi.fn<(a?: unknown) => Promise<unknown[]>>();
const areaFindMany = vi.fn<(a?: unknown) => Promise<unknown[]>>();
const donorFindMany = vi.fn<(a?: unknown) => Promise<unknown[]>>();
const uploadJobCreate = vi.fn<(a: unknown) => Promise<unknown>>();
const uploadJobUpdate = vi.fn<(a: unknown) => Promise<unknown>>();
const projectCreateMany = vi.fn<(a: unknown) => Promise<unknown>>();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (a: unknown) => userFindUnique(a) },
    organization: { findUnique: (a: unknown) => orgFindUnique(a) },
    referenceCountry: { findMany: (a?: unknown) => countryFindMany(a) },
    referenceSector: { findMany: (a?: unknown) => sectorFindMany(a) },
    administrativeArea: { findMany: (a?: unknown) => areaFindMany(a) },
    donor: { findMany: (a?: unknown) => donorFindMany(a) },
    uploadJob: {
      create: (a: unknown) => uploadJobCreate(a),
      update: (a: unknown) => uploadJobUpdate(a),
    },
    project: { createMany: (a: unknown) => projectCreateMany(a) },
  },
}));

vi.mock("@/lib/audit", () => ({
  AUDIT_ACTIONS: { UPLOAD_COMPLETED: "UPLOAD_COMPLETED" },
  logAudit: vi.fn<() => Promise<void>>(async () => undefined),
}));

// Use the real rate-limit helper but reset its store between tests.
import {
  __resetRateLimitStoreForTests,
  RATE_LIMITS,
} from "@/lib/rate-limit";

import { POST } from "@/app/api/upload/route";

function makeReq(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return {
    url: "https://app.example/api/upload",
    headers: {
      get: (name: string) =>
        headers[name.toLowerCase()] ??
        (name.toLowerCase() === "x-forwarded-for" ? "1.1.1.1" : null),
    },
    json: async () => body,
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimitStoreForTests();

  countryFindMany.mockResolvedValue([]);
  sectorFindMany.mockResolvedValue([]);
  areaFindMany.mockResolvedValue([]);
  donorFindMany.mockResolvedValue([]);
});

describe("POST /api/upload — auth", () => {
  it("returns 401 when there is no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeReq({}));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
  });

  it("returns 403 when the session has no role", async () => {
    mockGetSession.mockResolvedValue({
      userId: "u",
      email: "x@example.com",
      displayName: null,
    });
    userFindUnique.mockResolvedValue({ id: "u", email: "x@example.com", role: null });
    const res = await POST(makeReq({}));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/upload — header / row validation", () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({
      userId: "partner-1",
      email: "p@example.com",
      displayName: "P",
    });
    userFindUnique.mockResolvedValue({
      id: "partner-1",
      email: "p@example.com",
      role: { role: "PARTNER_ADMIN", organizationId: "org-1" },
    });
  });

  it("returns 400 with missingHeaders when a required column is absent", async () => {
    const res = await POST(
      makeReq({
        rows: [
          {
            title: "t",
            countryCode: "KE",
            sectorKey: "HEALTH",
            status: "ACTIVE",
            startDate: "2025-01-01",
            latitude: "-1.2",
            // longitude missing
          },
        ],
        headers: [
          "title",
          "countryCode",
          "sectorKey",
          "status",
          "startDate",
          "latitude",
          // longitude intentionally missing
        ],
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.missingHeaders).toContain("longitude");
    expect(Array.isArray(body.requiredHeaders)).toBe(true);
    expect(body.requiredHeaders).toContain("longitude");
  });

  it("returns 413 when more than 10,000 rows are submitted", async () => {
    const requiredHeaders = [
      "title",
      "countryCode",
      "sectorKey",
      "status",
      "startDate",
      "latitude",
      "longitude",
    ];
    // 10,001 rows — exceeds the server-side cap (defined in route.ts).
    const rows = Array.from({ length: 10_001 }, () => ({
      title: "t",
      countryCode: "KE",
      sectorKey: "HEALTH",
      status: "ACTIVE",
      startDate: "2025-01-01",
      latitude: "-1.2",
      longitude: "36.8",
    }));
    const res = await POST(makeReq({ rows, headers: requiredHeaders }));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.maxRows).toBe(10_000);
    expect(body.submittedRows).toBe(10_001);
  });

  it("refuses PARTNER_ADMIN override of organisation scope silently", async () => {
    // Partner Admin posts reqOrgId = some-other-org. The route must keep the
    // Partner's own organisationId (org-1), not the requested override.
    orgFindUnique.mockResolvedValue({
      id: "org-1",
      name: "Partner Org",
    });
    uploadJobCreate.mockResolvedValue({ id: "job-1" });

    const res = await POST(
      makeReq({
        organizationId: "evil-other-org",
        headers: [
          "title",
          "countryCode",
          "sectorKey",
          "status",
          "startDate",
          "latitude",
          "longitude",
        ],
        rows: [
          {
            title: "t",
            countryCode: "ZZ",
            sectorKey: "ZZ",
            status: "ACTIVE",
            startDate: "2025-01-01",
            latitude: "-1.2",
            longitude: "36.8",
          },
        ],
      }),
    );
    // We don't assert on status (row validation may error), only that the
    // organisation lookup was executed against the Partner's own org.
    expect(orgFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "org-1" } }),
    );
    // And never against the supplied override.
    const called = orgFindUnique.mock.calls.map(
      (c) => (c?.[0] as { where: { id: string } })?.where?.id,
    );
    expect(called).not.toContain("evil-other-org");
    expect(res).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Multi-country organization cross-check (PRD: "Update implementing
  // organization setup to support multiple operating countries").
  // Rows must fail validation when their countryCode is outside the
  // organisation's selected country scope, unless the org is ALL.
  // -----------------------------------------------------------------------
  it("blocks a row whose country is outside the SELECTED org scope", async () => {
    countryFindMany.mockResolvedValue([{ code: "KE" }, { code: "US" }]);
    sectorFindMany.mockResolvedValue([{ key: "HEALTH" }]);
    orgFindUnique.mockResolvedValue({
      id: "org-1",
      name: "Kenya-Only NGO",
      countryScope: "SELECTED",
      countryCode: "KE",
      operatingCountries: [{ countryCode: "KE" }],
    });
    uploadJobCreate.mockResolvedValue({ id: "job-1" });

    const res = await POST(
      makeReq({
        headers: [
          "title",
          "countryCode",
          "sectorKey",
          "status",
          "startDate",
          "latitude",
          "longitude",
        ],
        rows: [
          {
            title: "t",
            countryCode: "US",
            sectorKey: "HEALTH",
            status: "ACTIVE",
            startDate: "2025-01-01",
            latitude: "-1.2",
            longitude: "36.8",
          },
        ],
      }),
    );
    const body = (await res.json()) as {
      invalidRows: number;
      validRows: number;
      errors: Array<{ errors: string[] }>;
    };
    expect(body.invalidRows).toBe(1);
    expect(body.validRows).toBe(0);
    expect(body.errors[0].errors.join(" ")).toMatch(
      /not configured to operate/i,
    );
  });

  it("accepts any country when the org scope is ALL", async () => {
    countryFindMany.mockResolvedValue([{ code: "KE" }, { code: "US" }]);
    sectorFindMany.mockResolvedValue([{ key: "HEALTH" }]);
    orgFindUnique.mockResolvedValue({
      id: "org-1",
      name: "Global INGO",
      countryScope: "ALL",
      countryCode: null,
      operatingCountries: [],
    });
    uploadJobCreate.mockResolvedValue({ id: "job-1" });
    projectCreateMany.mockResolvedValue({ count: 1 });

    const res = await POST(
      makeReq({
        headers: [
          "title",
          "countryCode",
          "sectorKey",
          "status",
          "startDate",
          "latitude",
          "longitude",
        ],
        rows: [
          {
            title: "A US project from a global INGO",
            description: "Pilot programme",
            countryCode: "US",
            sectorKey: "HEALTH",
            status: "ACTIVE",
            startDate: "2025-01-01",
            latitude: "38.9",
            longitude: "-77.0",
          },
        ],
      }),
    );
    const body = (await res.json()) as {
      validRows: number;
      invalidRows: number;
    };
    expect(body.invalidRows).toBe(0);
    expect(body.validRows).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Soft-delete rejection for reference data consumed by the CSV validator.
//
// The release-hardening pass made the reference-data queries pair
// `active: true` with `deletedAt: null`, and the in-memory admin-area /
// donor validation treats a row as "not active" if either flag is off.
// These tests assert both invariants directly.
// ---------------------------------------------------------------------------

describe("POST /api/upload — soft-delete rejection", () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({
      userId: "partner-sd",
      email: "sd@example.com",
      displayName: "SD",
    });
    userFindUnique.mockResolvedValue({
      id: "partner-sd",
      email: "sd@example.com",
      role: { role: "PARTNER_ADMIN", organizationId: "org-sd" },
    });
  });

  it("queries ReferenceCountry with active:true AND deletedAt:null", async () => {
    countryFindMany.mockResolvedValue([{ code: "KE" }]);
    sectorFindMany.mockResolvedValue([{ key: "HEALTH" }]);
    orgFindUnique.mockResolvedValue({
      id: "org-sd",
      name: "NGO",
      countryScope: "ALL",
      countryCode: null,
      operatingCountries: [],
    });
    uploadJobCreate.mockResolvedValue({ id: "job-sd" });
    projectCreateMany.mockResolvedValue({ count: 1 });

    await POST(
      makeReq({
        headers: [
          "title",
          "countryCode",
          "sectorKey",
          "status",
          "startDate",
          "latitude",
          "longitude",
        ],
        rows: [
          {
            title: "t",
            countryCode: "KE",
            sectorKey: "HEALTH",
            status: "ACTIVE",
            startDate: "2025-01-01",
            latitude: "-1.2",
            longitude: "36.8",
          },
        ],
      }),
    );

    expect(countryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { active: true, deletedAt: null },
      }),
    );
    expect(sectorFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { active: true, deletedAt: null },
      }),
    );
  });

  it("rejects a row referencing a soft-deleted administrative area", async () => {
    countryFindMany.mockResolvedValue([{ code: "KE" }]);
    sectorFindMany.mockResolvedValue([{ key: "HEALTH" }]);
    orgFindUnique.mockResolvedValue({
      id: "org-sd",
      name: "NGO",
      countryScope: "ALL",
      countryCode: null,
      operatingCountries: [],
    });
    // Admin-area row exists but is soft-deleted (active:true, deletedAt:Date).
    areaFindMany.mockResolvedValue([
      {
        id: "area-1",
        name: "Nairobi",
        countryCode: "KE",
        active: true,
        deletedAt: new Date("2025-10-01"),
      },
    ]);
    uploadJobCreate.mockResolvedValue({ id: "job-sd" });

    const res = await POST(
      makeReq({
        headers: [
          "title",
          "countryCode",
          "sectorKey",
          "status",
          "startDate",
          "latitude",
          "longitude",
          "districtCounty",
        ],
        rows: [
          {
            title: "t",
            countryCode: "KE",
            sectorKey: "HEALTH",
            status: "ACTIVE",
            startDate: "2025-01-01",
            latitude: "-1.2",
            longitude: "36.8",
            districtCounty: "Nairobi",
          },
        ],
      }),
    );
    const body = (await res.json()) as {
      invalidRows: number;
      validRows: number;
      errors: Array<{ errors: string[] }>;
    };
    expect(body.invalidRows).toBe(1);
    expect(body.validRows).toBe(0);
    expect(body.errors[0].errors.join(" ")).toMatch(
      /District \/ County 'Nairobi' is not active/i,
    );
  });

  it("rejects a row referencing a soft-deleted donor", async () => {
    countryFindMany.mockResolvedValue([{ code: "KE" }]);
    sectorFindMany.mockResolvedValue([{ key: "HEALTH" }]);
    orgFindUnique.mockResolvedValue({
      id: "org-sd",
      name: "NGO",
      countryScope: "ALL",
      countryCode: null,
      operatingCountries: [],
    });
    donorFindMany.mockResolvedValue([
      {
        id: "donor-1",
        name: "World Bank",
        active: true,
        deletedAt: new Date("2025-10-01"),
      },
    ]);
    uploadJobCreate.mockResolvedValue({ id: "job-sd" });

    const res = await POST(
      makeReq({
        headers: [
          "title",
          "countryCode",
          "sectorKey",
          "status",
          "startDate",
          "latitude",
          "longitude",
          "donor",
        ],
        rows: [
          {
            title: "t",
            countryCode: "KE",
            sectorKey: "HEALTH",
            status: "ACTIVE",
            startDate: "2025-01-01",
            latitude: "-1.2",
            longitude: "36.8",
            donor: "World Bank",
          },
        ],
      }),
    );
    const body = (await res.json()) as {
      invalidRows: number;
      validRows: number;
      errors: Array<{ errors: string[] }>;
    };
    expect(body.invalidRows).toBe(1);
    expect(body.validRows).toBe(0);
    expect(body.errors[0].errors.join(" ")).toMatch(
      /Donor 'World Bank' is not active/i,
    );
  });
});

describe("POST /api/upload — rate limit", () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({
      userId: "u-rl",
      email: "r@example.com",
      displayName: "R",
    });
    userFindUnique.mockResolvedValue({
      id: "u-rl",
      email: "r@example.com",
      role: { role: "PARTNER_ADMIN", organizationId: "org-rl" },
    });
    orgFindUnique.mockResolvedValue({ id: "org-rl", name: "Rate Org" });
  });

  it("returns 429 once the user-scoped upload limit is exhausted", async () => {
    const body = {
      rows: [], // will fail with 400 "No data rows provided" but only after rate-limit check
      headers: ["title"],
    };
    // First RATE_LIMITS.upload.limit calls succeed (or fail for non-429 reason).
    for (let i = 0; i < RATE_LIMITS.upload.limit; i++) {
      const res = await POST(makeReq(body));
      expect(res.status).not.toBe(429);
    }
    const over = await POST(makeReq(body));
    expect(over.status).toBe(429);
    const payload = await over.json();
    expect(payload.error).toMatch(/too many requests/i);
  });
});