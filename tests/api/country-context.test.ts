/**
 * API tests for /api/reference/countries/:code/context (Prompt 8 · Part I).
 *
 * Covers the ACCESS CONTROL + VALIDATION contract:
 *   - Anonymous callers → 401 on GET/PUT/DELETE.
 *   - PARTNER_ADMIN → 200 on GET (read-only access to country context) but
 *     403 on PUT / DELETE.
 *   - SYSTEM_OWNER → full read + write.
 *   - PUT with invalid indicator key / year / value → 400 with details.
 *   - GET returns the population summary and history shape expected by the
 *     Reports page + Data Quality block.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetSession = vi.fn();
vi.mock("@/lib/session", () => ({
  getSession: () => mockGetSession(),
}));

// We don't want real audit writes interfering with the mocks.
vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(async () => {}),
  AUDIT_ACTIONS: {},
}));

const userFindUnique = vi.fn<(args?: unknown) => Promise<unknown>>();
const countryFindUnique = vi.fn<(args?: unknown) => Promise<unknown>>();
const areaFindMany = vi.fn<(args?: unknown) => Promise<unknown[]>>();
const indicatorFindMany = vi.fn<(args?: unknown) => Promise<unknown[]>>();
const indicatorUpsert = vi.fn<(args?: unknown) => Promise<unknown>>();
const indicatorDelete = vi.fn<(args?: unknown) => Promise<unknown>>();
const transaction = vi.fn<(fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>>();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (a: unknown) => userFindUnique(a) },
    referenceCountry: { findUnique: (a: unknown) => countryFindUnique(a) },
    administrativeArea: { findMany: (a: unknown) => areaFindMany(a) },
    countryIndicator: {
      findMany: (a: unknown) => indicatorFindMany(a),
      upsert: (a: unknown) => indicatorUpsert(a),
      delete: (a: unknown) => indicatorDelete(a),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => transaction(fn),
  },
}));

import type { NextResponse } from "next/server";
import {
  DELETE as contextDeleteRaw,
  GET as contextGetRaw,
  PUT as contextPutRaw,
} from "@/app/api/reference/countries/[code]/context/route";

// Next.js infers route-handler return types as `NextResponse | undefined`
// when the handler signature includes a params context. The tests below
// never exercise the undefined branch (every return in the handler is
// an explicit NextResponse), so we narrow the signatures here to keep
// the tests readable.
type Params = { params: Promise<{ code: string }> };
const contextGet = contextGetRaw as (
  r: Parameters<typeof contextGetRaw>[0],
  p: Params,
) => Promise<NextResponse>;
const contextPut = contextPutRaw as (
  r: Parameters<typeof contextPutRaw>[0],
  p: Params,
) => Promise<NextResponse>;
const contextDelete = contextDeleteRaw as (
  r: Parameters<typeof contextDeleteRaw>[0],
  p: Params,
) => Promise<NextResponse>;

function makeReq(url: string, init?: { method?: string; body?: unknown }): NextRequest {
  const body = init?.body;
  return {
    url,
    method: init?.method ?? "GET",
    json: async () => body,
  } as unknown as NextRequest;
}

function params(code: string) {
  return { params: Promise.resolve({ code }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  areaFindMany.mockResolvedValue([]);
  indicatorFindMany.mockResolvedValue([]);
  indicatorUpsert.mockImplementation(async (args: unknown) => {
    const a = args as { create?: unknown; update?: unknown; where?: unknown };
    return a.create ?? a.update ?? { id: "ind-1" };
  });
  // Default: run the transaction callback against a thin wrapper that
  // delegates back to the mocked prisma.countryIndicator helpers.
  transaction.mockImplementation(async (fn) =>
    fn({
      countryIndicator: {
        upsert: (a: unknown) => indicatorUpsert(a),
      },
    }),
  );
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe("GET /api/reference/countries/:code/context", () => {
  it("returns 401 for anonymous callers", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await contextGet(
      makeReq("https://app.example/api/reference/countries/UG/context"),
      params("UG"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 if the country does not exist", async () => {
    mockGetSession.mockResolvedValue({ userId: "u", email: "a@b.c", displayName: null });
    userFindUnique.mockResolvedValue({
      id: "u",
      role: { role: "SYSTEM_OWNER", organizationId: null },
    });
    countryFindUnique.mockResolvedValue(null);
    const res = await contextGet(
      makeReq("https://app.example/api/reference/countries/ZZ/context"),
      params("ZZ"),
    );
    expect(res.status).toBe(404);
  });

  it("returns population summary, indicator history, and completeness for a Partner Admin", async () => {
    mockGetSession.mockResolvedValue({
      userId: "partner-1",
      email: "p@example.com",
      displayName: "P",
    });
    userFindUnique.mockResolvedValue({
      id: "partner-1",
      role: { role: "PARTNER_ADMIN", organizationId: "org-partner" },
    });
    countryFindUnique.mockResolvedValue({
      code: "UG",
      name: "Uganda",
      type: "COUNTRY",
      active: true,
    });
    areaFindMany.mockResolvedValue([
      {
        id: "a-1",
        name: "Kampala District",
        active: true,
        estimatedPopulation: 1_000_000,
        populationYear: 2020,
      },
      {
        id: "a-2",
        name: "Gulu District",
        active: true,
        estimatedPopulation: null,
        populationYear: null,
      },
    ]);
    indicatorFindMany.mockResolvedValue([
      {
        indicatorKey: "GDP_PER_CAPITA_CURRENT_USD",
        year: 2023,
        value: 950,
        rank: null,
        unit: "USD",
        source: "World Bank",
        sourceUrl: null,
        notes: null,
      },
      {
        indicatorKey: "GDP_PER_CAPITA_CURRENT_USD",
        year: 2022,
        value: 900,
        rank: null,
        unit: "USD",
        source: "World Bank",
        sourceUrl: null,
        notes: null,
      },
    ]);

    const res = await contextGet(
      makeReq("https://app.example/api/reference/countries/UG/context"),
      params("UG"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      country: { code: string };
      populationSummary: {
        calculatedPopulation: number | null;
        populationCompletenessPercent: number | null;
        administrativeAreasMissingPopulation: number;
      };
      indicators: Record<string, { history: unknown[]; latest: unknown }>;
      completeness: {
        gdpPerCapitaPresent: boolean;
        missingIndicatorLabels: string[];
      };
      notes: string[];
    };

    expect(body.country.code).toBe("UG");
    expect(body.populationSummary.calculatedPopulation).toBe(1_000_000);
    expect(body.populationSummary.administrativeAreasMissingPopulation).toBe(1);
    expect(body.populationSummary.populationCompletenessPercent).toBe(50);
    expect(body.indicators.GDP_PER_CAPITA_CURRENT_USD.history).toHaveLength(2);
    expect(body.indicators.HDI_SCORE.history).toHaveLength(0);
    expect(body.completeness.gdpPerCapitaPresent).toBe(true);
    expect(body.completeness.missingIndicatorLabels.length).toBeGreaterThan(0);
    expect(body.notes.some((n) => n.toLowerCase().includes("contextual"))).toBe(
      false,
    );
    // Both display notes must be included.
    expect(body.notes.some((n) => n.includes("manually entered"))).toBe(true);
    expect(body.notes.some((n) => n.includes("calculated"))).toBe(true);
  });

  it("upper-cases the country code before lookup", async () => {
    mockGetSession.mockResolvedValue({ userId: "u", email: "a@b.c", displayName: null });
    userFindUnique.mockResolvedValue({
      id: "u",
      role: { role: "SYSTEM_OWNER", organizationId: null },
    });
    countryFindUnique.mockResolvedValue({
      code: "UG",
      name: "Uganda",
      type: "COUNTRY",
      active: true,
    });
    await contextGet(
      makeReq("https://app.example/api/reference/countries/ug/context"),
      params("ug"),
    );
    const call = countryFindUnique.mock.calls[0]?.[0] as {
      where?: { code?: string };
    };
    expect(call?.where?.code).toBe("UG");
  });
});

// ---------------------------------------------------------------------------
// PUT
// ---------------------------------------------------------------------------

describe("PUT /api/reference/countries/:code/context", () => {
  it("returns 401 for anonymous callers", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await contextPut(
      makeReq("https://app.example/api/reference/countries/UG/context", {
        method: "PUT",
        body: { indicators: [] },
      }),
      params("UG"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for PARTNER_ADMIN", async () => {
    mockGetSession.mockResolvedValue({
      userId: "p",
      email: "p@p.p",
      displayName: "P",
    });
    userFindUnique.mockResolvedValue({
      id: "p",
      role: { role: "PARTNER_ADMIN", organizationId: "org-p" },
    });
    const res = await contextPut(
      makeReq("https://app.example/api/reference/countries/UG/context", {
        method: "PUT",
        body: {
          indicators: [
            { indicatorKey: "HDI_SCORE", year: 2024, value: 0.5 },
          ],
        },
      }),
      params("UG"),
    );
    expect(res.status).toBe(403);
    expect(indicatorUpsert).not.toHaveBeenCalled();
  });

  it("returns 400 when an indicator row has invalid data", async () => {
    mockGetSession.mockResolvedValue({
      userId: "o",
      email: "o@o.o",
      displayName: "O",
    });
    userFindUnique.mockResolvedValue({
      id: "o",
      role: { role: "SYSTEM_OWNER", organizationId: null },
    });
    countryFindUnique.mockResolvedValue({
      code: "UG",
      name: "Uganda",
      type: "COUNTRY",
      active: true,
    });
    const res = await contextPut(
      makeReq("https://app.example/api/reference/countries/UG/context", {
        method: "PUT",
        body: {
          indicators: [
            // invalid HDI score
            { indicatorKey: "HDI_SCORE", year: 2024, value: 1.5 },
            // invalid key
            { indicatorKey: "NOT_A_KEY", year: 2024, value: 10 },
          ],
        },
      }),
      params("UG"),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { details?: Array<{ index: number }> };
    expect(body.details?.length).toBe(2);
    expect(indicatorUpsert).not.toHaveBeenCalled();
  });

  it("upserts valid indicator rows as a SYSTEM_OWNER", async () => {
    mockGetSession.mockResolvedValue({
      userId: "o",
      email: "o@o.o",
      displayName: "O",
    });
    userFindUnique.mockResolvedValue({
      id: "o",
      role: { role: "SYSTEM_OWNER", organizationId: null },
    });
    countryFindUnique.mockResolvedValue({
      code: "UG",
      name: "Uganda",
      type: "COUNTRY",
      active: true,
    });
    const res = await contextPut(
      makeReq("https://app.example/api/reference/countries/UG/context", {
        method: "PUT",
        body: {
          indicators: [
            {
              indicatorKey: "GDP_PER_CAPITA_CURRENT_USD",
              year: 2023,
              value: 950,
              source: "World Bank",
              sourceUrl: "https://data.worldbank.org/",
            },
            {
              indicatorKey: "HDI_RANK",
              year: 2023,
              rank: 166,
              source: "UNDP",
            },
          ],
        },
      }),
      params("UG"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { upserted: number };
    expect(body.upserted).toBe(2);
    expect(indicatorUpsert).toHaveBeenCalledTimes(2);
    const firstCall = indicatorUpsert.mock.calls[0]?.[0] as {
      where?: { countryCode_indicatorKey_year?: { countryCode?: string } };
    };
    expect(
      firstCall?.where?.countryCode_indicatorKey_year?.countryCode,
    ).toBe("UG");
  });

  it("returns 400 when the body has no indicators", async () => {
    mockGetSession.mockResolvedValue({
      userId: "o",
      email: "o@o.o",
      displayName: "O",
    });
    userFindUnique.mockResolvedValue({
      id: "o",
      role: { role: "SYSTEM_OWNER", organizationId: null },
    });
    countryFindUnique.mockResolvedValue({
      code: "UG",
      name: "Uganda",
      type: "COUNTRY",
      active: true,
    });
    const res = await contextPut(
      makeReq("https://app.example/api/reference/countries/UG/context", {
        method: "PUT",
        body: {},
      }),
      params("UG"),
    );
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe("DELETE /api/reference/countries/:code/context", () => {
  it("returns 401 for anonymous callers", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await contextDelete(
      makeReq(
        "https://app.example/api/reference/countries/UG/context?indicatorKey=HDI_SCORE&year=2024",
        { method: "DELETE" },
      ),
      params("UG"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for PARTNER_ADMIN", async () => {
    mockGetSession.mockResolvedValue({
      userId: "p",
      email: "p@p.p",
      displayName: "P",
    });
    userFindUnique.mockResolvedValue({
      id: "p",
      role: { role: "PARTNER_ADMIN", organizationId: "org-p" },
    });
    const res = await contextDelete(
      makeReq(
        "https://app.example/api/reference/countries/UG/context?indicatorKey=HDI_SCORE&year=2024",
        { method: "DELETE" },
      ),
      params("UG"),
    );
    expect(res.status).toBe(403);
  });

  it("rejects invalid indicator keys with 400", async () => {
    mockGetSession.mockResolvedValue({
      userId: "o",
      email: "o@o.o",
      displayName: "O",
    });
    userFindUnique.mockResolvedValue({
      id: "o",
      role: { role: "SYSTEM_OWNER", organizationId: null },
    });
    const res = await contextDelete(
      makeReq(
        "https://app.example/api/reference/countries/UG/context?indicatorKey=BOGUS&year=2024",
        { method: "DELETE" },
      ),
      params("UG"),
    );
    expect(res.status).toBe(400);
    expect(indicatorDelete).not.toHaveBeenCalled();
  });

  it("deletes a valid row as SYSTEM_OWNER", async () => {
    mockGetSession.mockResolvedValue({
      userId: "o",
      email: "o@o.o",
      displayName: "O",
    });
    userFindUnique.mockResolvedValue({
      id: "o",
      role: { role: "SYSTEM_OWNER", organizationId: null },
    });
    indicatorDelete.mockResolvedValue({ id: "row-1" });
    const res = await contextDelete(
      makeReq(
        "https://app.example/api/reference/countries/UG/context?indicatorKey=HDI_SCORE&year=2024",
        { method: "DELETE" },
      ),
      params("UG"),
    );
    expect(res.status).toBe(200);
    expect(indicatorDelete).toHaveBeenCalledOnce();
    const call = indicatorDelete.mock.calls[0]?.[0] as {
      where?: {
        countryCode_indicatorKey_year?: {
          countryCode?: string;
          indicatorKey?: string;
          year?: number;
        };
      };
    };
    expect(
      call?.where?.countryCode_indicatorKey_year?.indicatorKey,
    ).toBe("HDI_SCORE");
    expect(call?.where?.countryCode_indicatorKey_year?.year).toBe(2024);
  });
});