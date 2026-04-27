/**
 * API tests for /api/reference/administrative-areas (Prompt 9 · Part G).
 *
 * These tests were added after the live app surfaced a regression: editing
 * an Administrative Area wiped its estimatedPopulation / populationYear /
 * populationSource / populationSourceUrl / populationNotes columns, and
 * toggling the active flag did the same. Root cause was the PUT handler
 * revalidating against a hand-rolled 5-field subset that always coerced the
 * 5 population fields to null.
 *
 * The tests lock in the CORRECTED partial-update contract:
 *   - Any field OMITTED from the request body is preserved from the row.
 *   - Any field PRESENT in the request body — including explicit `null` —
 *     is written as an intentional change.
 *   - Auth / RBAC (401 for anon, 403 for PARTNER_ADMIN) remain enforced.
 *   - Validation errors (negative population, garbage year) still 400.
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

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(async () => {}),
  AUDIT_ACTIONS: { CMS_UPDATED: "CMS_UPDATED" },
}));

const userFindUnique = vi.fn<(args?: unknown) => Promise<unknown>>();
const areaFindUnique = vi.fn<(args?: unknown) => Promise<unknown>>();
const areaFindMany = vi.fn<(args?: unknown) => Promise<unknown[]>>();
const areaUpdate = vi.fn<(args?: unknown) => Promise<unknown>>();
const areaCreate = vi.fn<(args?: unknown) => Promise<unknown>>();
const countryFindUnique = vi.fn<(args?: unknown) => Promise<unknown>>();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (a: unknown) => userFindUnique(a) },
    referenceCountry: { findUnique: (a: unknown) => countryFindUnique(a) },
    administrativeArea: {
      findUnique: (a: unknown) => areaFindUnique(a),
      findMany: (a: unknown) => areaFindMany(a),
      update: (a: unknown) => areaUpdate(a),
      create: (a: unknown) => areaCreate(a),
    },
  },
}));

import type { NextResponse } from "next/server";
import {
  GET as listGetRaw,
  POST as listPostRaw,
} from "@/app/api/reference/administrative-areas/route";
import { PUT as itemPutRaw } from "@/app/api/reference/administrative-areas/[id]/route";

type AnyHandler = (
  req: NextRequest,
  ctx?: { params: Promise<{ id: string }> },
) => Promise<NextResponse>;

const listGet = listGetRaw as unknown as AnyHandler;
const listPost = listPostRaw as unknown as AnyHandler;
const itemPut = itemPutRaw as unknown as AnyHandler;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SYSTEM_OWNER_SESSION = { userId: "u-owner" };
const PARTNER_ADMIN_SESSION = { userId: "u-partner" };

function mockSystemOwner() {
  mockGetSession.mockResolvedValue(SYSTEM_OWNER_SESSION);
  userFindUnique.mockResolvedValue({
    id: "u-owner",
    email: "owner@test",
    role: { role: "SYSTEM_OWNER" },
  });
}
function mockPartnerAdmin() {
  mockGetSession.mockResolvedValue(PARTNER_ADMIN_SESSION);
  userFindUnique.mockResolvedValue({
    id: "u-partner",
    email: "partner@test",
    role: { role: "PARTNER_ADMIN" },
  });
}
function mockAnon() {
  mockGetSession.mockResolvedValue(null);
  userFindUnique.mockResolvedValue(null);
}

function makeRequest(url: string, init?: RequestInit): NextRequest {
  return new Request(url, init) as unknown as NextRequest;
}

const BASE_AREA = {
  id: "area-1",
  name: "Bomi",
  type: "COUNTY",
  countryCode: "LR",
  active: true,
  sortOrder: 0,
  estimatedPopulation: 100_000,
  populationYear: 2022,
  populationSource: "National Census 2022",
  populationSourceUrl: "https://example.org/census",
  populationNotes: "includes informal settlements",
};

beforeEach(() => {
  vi.clearAllMocks();
  areaFindUnique.mockResolvedValue({ ...BASE_AREA });
  areaUpdate.mockImplementation(async ({ data, where }: any) => ({
    ...BASE_AREA,
    ...data,
    id: where.id,
  }));
  areaCreate.mockImplementation(async ({ data }: any) => ({
    id: "area-new",
    ...data,
  }));
  countryFindUnique.mockResolvedValue({
    code: "LR",
    name: "Liberia",
    active: true,
  });
});

// ---------------------------------------------------------------------------
// GET /api/reference/administrative-areas
// ---------------------------------------------------------------------------

describe("GET /api/reference/administrative-areas", () => {
  it("returns population fields on the row shape", async () => {
    mockSystemOwner();
    areaFindMany.mockResolvedValue([{ ...BASE_AREA }]);
    const res = await listGet(
      makeRequest("http://t/api/reference/administrative-areas"),
    );
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.administrativeAreas).toHaveLength(1);
    expect(body.administrativeAreas[0]).toMatchObject({
      estimatedPopulation: 100_000,
      populationYear: 2022,
      populationSource: "National Census 2022",
      populationSourceUrl: "https://example.org/census",
      populationNotes: "includes informal settlements",
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/reference/administrative-areas
// ---------------------------------------------------------------------------

describe("POST /api/reference/administrative-areas", () => {
  it("persists population fields on create", async () => {
    mockSystemOwner();
    const res = await listPost(
      makeRequest("http://t/api/reference/administrative-areas", {
        method: "POST",
        body: JSON.stringify({
          name: "Grand Kru",
          type: "County",
          countryCode: "LR",
          sortOrder: 0,
          active: true,
          estimatedPopulation: "82500",
          populationYear: "2022",
          populationSource: "National Census 2022",
          populationSourceUrl: "https://example.org/lr/grand-kru",
          populationNotes: "projection based on 2008 census",
        }),
      }),
    );
    expect(res.status).toBe(201);
    expect(areaCreate).toHaveBeenCalledTimes(1);
    const arg: any = areaCreate.mock.calls[0][0];
    expect(arg.data).toMatchObject({
      estimatedPopulation: 82500,
      populationYear: 2022,
      populationSource: "National Census 2022",
      populationSourceUrl: "https://example.org/lr/grand-kru",
      populationNotes: "projection based on 2008 census",
    });
  });

  it("treats empty strings as null population", async () => {
    mockSystemOwner();
    const res = await listPost(
      makeRequest("http://t/api/reference/administrative-areas", {
        method: "POST",
        body: JSON.stringify({
          name: "Rivercess",
          type: "County",
          countryCode: "LR",
          estimatedPopulation: "",
          populationYear: "",
          populationSource: "",
          populationSourceUrl: "",
          populationNotes: "",
        }),
      }),
    );
    expect(res.status).toBe(201);
    const arg: any = areaCreate.mock.calls[0][0];
    expect(arg.data.estimatedPopulation).toBeNull();
    expect(arg.data.populationYear).toBeNull();
    expect(arg.data.populationSource).toBeNull();
    expect(arg.data.populationSourceUrl).toBeNull();
    expect(arg.data.populationNotes).toBeNull();
  });

  it("rejects a negative population", async () => {
    mockSystemOwner();
    const res = await listPost(
      makeRequest("http://t/api/reference/administrative-areas", {
        method: "POST",
        body: JSON.stringify({
          name: "Sinoe",
          type: "County",
          countryCode: "LR",
          estimatedPopulation: -50,
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(areaCreate).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range year", async () => {
    mockSystemOwner();
    const res = await listPost(
      makeRequest("http://t/api/reference/administrative-areas", {
        method: "POST",
        body: JSON.stringify({
          name: "Nimba",
          type: "County",
          countryCode: "LR",
          estimatedPopulation: 500_000,
          populationYear: 1899,
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(areaCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PUT /api/reference/administrative-areas/:id (merge semantics)
// ---------------------------------------------------------------------------

describe("PUT /api/reference/administrative-areas/:id", () => {
  it("persists new population fields when the full payload is sent", async () => {
    mockSystemOwner();
    const res = await itemPut(
      makeRequest("http://t/api/reference/administrative-areas/area-1", {
        method: "PUT",
        body: JSON.stringify({
          name: "Bomi",
          type: "County",
          countryCode: "LR",
          active: true,
          sortOrder: 0,
          estimatedPopulation: 123_000,
          populationYear: 2021,
          populationSource: "LISGIS estimate",
          populationSourceUrl: "https://example.org/lisgis",
          populationNotes: "updated after redistricting",
        }),
      }),
      { params: Promise.resolve({ id: "area-1" }) },
    );
    expect(res.status).toBe(200);
    const arg: any = areaUpdate.mock.calls[0][0];
    expect(arg.data).toMatchObject({
      estimatedPopulation: 123_000,
      populationYear: 2021,
      populationSource: "LISGIS estimate",
      populationSourceUrl: "https://example.org/lisgis",
      populationNotes: "updated after redistricting",
    });
  });

  it("PRESERVES existing population when payload omits population fields (Activate/Deactivate bug fix)", async () => {
    // This is the exact regression reported from the live app: clicking
    // "Deactivate" sent `{active: false}` ONLY, and the previous validator
    // coerced the 5 missing population fields to null, wiping them silently.
    mockSystemOwner();
    const res = await itemPut(
      makeRequest("http://t/api/reference/administrative-areas/area-1", {
        method: "PUT",
        body: JSON.stringify({ active: false }),
      }),
      { params: Promise.resolve({ id: "area-1" }) },
    );
    expect(res.status).toBe(200);
    const arg: any = areaUpdate.mock.calls[0][0];
    expect(arg.data).toMatchObject({
      active: false,
      // These must match BASE_AREA, NOT null.
      estimatedPopulation: 100_000,
      populationYear: 2022,
      populationSource: "National Census 2022",
      populationSourceUrl: "https://example.org/census",
      populationNotes: "includes informal settlements",
    });
  });

  it("clears a population field when the client sends explicit null", async () => {
    mockSystemOwner();
    const res = await itemPut(
      makeRequest("http://t/api/reference/administrative-areas/area-1", {
        method: "PUT",
        body: JSON.stringify({
          estimatedPopulation: null,
          populationYear: null,
          populationSource: null,
        }),
      }),
      { params: Promise.resolve({ id: "area-1" }) },
    );
    expect(res.status).toBe(200);
    const arg: any = areaUpdate.mock.calls[0][0];
    expect(arg.data.estimatedPopulation).toBeNull();
    expect(arg.data.populationYear).toBeNull();
    expect(arg.data.populationSource).toBeNull();
    // Untouched fields must be preserved.
    expect(arg.data.populationSourceUrl).toBe("https://example.org/census");
    expect(arg.data.populationNotes).toBe("includes informal settlements");
  });

  it("clears a population field when the client sends empty string", async () => {
    mockSystemOwner();
    const res = await itemPut(
      makeRequest("http://t/api/reference/administrative-areas/area-1", {
        method: "PUT",
        body: JSON.stringify({
          estimatedPopulation: "",
          populationYear: "",
        }),
      }),
      { params: Promise.resolve({ id: "area-1" }) },
    );
    expect(res.status).toBe(200);
    const arg: any = areaUpdate.mock.calls[0][0];
    expect(arg.data.estimatedPopulation).toBeNull();
    expect(arg.data.populationYear).toBeNull();
  });

  it("rejects a negative population on update", async () => {
    mockSystemOwner();
    const res = await itemPut(
      makeRequest("http://t/api/reference/administrative-areas/area-1", {
        method: "PUT",
        body: JSON.stringify({ estimatedPopulation: -10 }),
      }),
      { params: Promise.resolve({ id: "area-1" }) },
    );
    expect(res.status).toBe(400);
    expect(areaUpdate).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range year on update", async () => {
    mockSystemOwner();
    const res = await itemPut(
      makeRequest("http://t/api/reference/administrative-areas/area-1", {
        method: "PUT",
        body: JSON.stringify({ populationYear: 3000 }),
      }),
      { params: Promise.resolve({ id: "area-1" }) },
    );
    expect(res.status).toBe(400);
    expect(areaUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when row does not exist", async () => {
    mockSystemOwner();
    areaFindUnique.mockResolvedValue(null);
    const res = await itemPut(
      makeRequest("http://t/api/reference/administrative-areas/missing", {
        method: "PUT",
        body: JSON.stringify({ estimatedPopulation: 1 }),
      }),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 for anonymous callers", async () => {
    mockAnon();
    const res = await itemPut(
      makeRequest("http://t/api/reference/administrative-areas/area-1", {
        method: "PUT",
        body: JSON.stringify({ active: false }),
      }),
      { params: Promise.resolve({ id: "area-1" }) },
    );
    expect(res.status).toBe(401);
    expect(areaUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 for PARTNER_ADMIN", async () => {
    mockPartnerAdmin();
    const res = await itemPut(
      makeRequest("http://t/api/reference/administrative-areas/area-1", {
        method: "PUT",
        body: JSON.stringify({ estimatedPopulation: 42 }),
      }),
      { params: Promise.resolve({ id: "area-1" }) },
    );
    expect(res.status).toBe(403);
    expect(areaUpdate).not.toHaveBeenCalled();
  });
});