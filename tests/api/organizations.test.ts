/**
 * API tests for /api/organizations — multi-country support.
 *
 * Locks in the contract added in the "Update implementing organization
 * setup to support multiple operating countries" PRD:
 *   - GET returns `countryScope` + `countryIds` (derived from the join
 *     table) alongside the legacy `countryCode` scalar.
 *   - GET accepts `?country=XX` and returns orgs whose scope is ALL OR
 *     whose OrganizationCountry set contains the code.
 *   - POST / PUT accept the new shape and persist via the join table;
 *     SELECTED + empty ids returns 400; invalid / soft-deleted country
 *     ids return 400.
 *   - RBAC: anon → 401, PARTNER_ADMIN → 403 on POST/PUT.
 *   - Back-compat: legacy { countryCode } payload still works.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetSession = vi.fn();
vi.mock("@/lib/session", () => ({
  getSession: () => mockGetSession(),
}));

const mockLogAudit = vi.fn(async () => {});
vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...(args as [])),
  AUDIT_ACTIONS: {
    ORGANIZATION_CREATED: "ORGANIZATION_CREATED",
    ORGANIZATION_UPDATED: "ORGANIZATION_UPDATED",
  },
}));

const userFindUnique = vi.fn<(args?: unknown) => Promise<unknown>>();
const orgFindMany = vi.fn<(args?: unknown) => Promise<unknown[]>>();
const orgFindUnique = vi.fn<(args?: unknown) => Promise<unknown>>();
const orgFindUniqueOrThrow =
  vi.fn<(args?: unknown) => Promise<unknown>>();
const orgCreate = vi.fn<(args?: unknown) => Promise<unknown>>();
const orgUpdate = vi.fn<(args?: unknown) => Promise<unknown>>();
const orgCountryDeleteMany =
  vi.fn<(args?: unknown) => Promise<unknown>>();
const orgCountryCreateMany =
  vi.fn<(args?: unknown) => Promise<unknown>>();
const countryFindMany = vi.fn<(args?: unknown) => Promise<unknown[]>>();

vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: { findUnique: (a: unknown) => userFindUnique(a) },
    organization: {
      findMany: (a: unknown) => orgFindMany(a),
      findUnique: (a: unknown) => orgFindUnique(a),
      findUniqueOrThrow: (a: unknown) => orgFindUniqueOrThrow(a),
      create: (a: unknown) => orgCreate(a),
      update: (a: unknown) => orgUpdate(a),
    },
    organizationCountry: {
      deleteMany: (a: unknown) => orgCountryDeleteMany(a),
      createMany: (a: unknown) => orgCountryCreateMany(a),
    },
    referenceCountry: {
      findMany: (a: unknown) => countryFindMany(a),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };
  return { prisma };
});

import {
  GET as listGetRaw,
  POST as listPostRaw,
} from "@/app/api/organizations/route";
import {
  GET as itemGetRaw,
  PUT as itemPutRaw,
} from "@/app/api/organizations/[id]/route";

type AnyHandler = (
  req: NextRequest,
  ctx?: { params: Promise<{ id: string }> },
) => Promise<NextResponse>;

const listGet = listGetRaw as unknown as AnyHandler;
const listPost = listPostRaw as unknown as AnyHandler;
const itemGet = itemGetRaw as unknown as AnyHandler;
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
    email: "owner@example.com",
    role: { role: "SYSTEM_OWNER", organizationId: null },
  });
}

function mockPartnerAdmin(orgId: string | null = "p-org") {
  mockGetSession.mockResolvedValue(PARTNER_ADMIN_SESSION);
  userFindUnique.mockResolvedValue({
    id: "u-partner",
    email: "partner@example.com",
    role: { role: "PARTNER_ADMIN", organizationId: orgId },
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

beforeEach(() => {
  vi.clearAllMocks();
  // Default country table: four active, non-deleted codes.
  countryFindMany.mockResolvedValue(
    ["US", "KE", "TZ", "GB"].map((code) => ({ code })),
  );
});

// ---------------------------------------------------------------------------
// GET /api/organizations
// ---------------------------------------------------------------------------

describe("GET /api/organizations", () => {
  it("returns countryScope + countryIds for every row (from join table)", async () => {
    mockAnonymous();
    orgFindMany.mockResolvedValue([
      {
        id: "org-1",
        name: "World Vision",
        type: "INGO",
        countryScope: "ALL",
        countryCode: null,
        website: null,
        contactEmail: null,
        description: null,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        operatingCountries: [],
        _count: { projects: 0, users: 0 },
      },
      {
        id: "org-2",
        name: "Local NGO",
        type: "LNGO",
        countryScope: "SELECTED",
        countryCode: "KE",
        website: null,
        contactEmail: null,
        description: null,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        operatingCountries: [{ countryCode: "KE" }, { countryCode: "TZ" }],
        _count: { projects: 5, users: 2 },
      },
    ]);

    const res = await listGet(makeReq("http://x/api/organizations"));
    const body = (await res.json()) as {
      organizations: Array<{
        id: string;
        countryScope: "ALL" | "SELECTED";
        countryIds: string[];
        countryCode: string | null;
      }>;
    };
    expect(res.status).toBe(200);
    expect(body.organizations).toHaveLength(2);
    expect(body.organizations[0]).toMatchObject({
      countryScope: "ALL",
      countryIds: [],
    });
    expect(body.organizations[1]).toMatchObject({
      countryScope: "SELECTED",
      countryIds: ["KE", "TZ"],
      countryCode: "KE",
    });
  });

  it("?country=XX returns orgs whose scope is ALL OR whose join contains the code", async () => {
    mockAnonymous();
    orgFindMany.mockResolvedValue([]);

    await listGet(makeReq("http://x/api/organizations?country=ke"));

    const whereArg = (orgFindMany.mock.calls[0]?.[0] as {
      where: { OR?: unknown[] };
    })?.where;
    expect(whereArg?.OR).toEqual([
      { countryScope: "ALL" },
      { operatingCountries: { some: { countryCode: "KE" } } },
    ]);
  });

  it("PARTNER_ADMIN only sees their own org (ignores country filter semantics)", async () => {
    mockPartnerAdmin("p-org");
    orgFindMany.mockResolvedValue([]);

    await listGet(makeReq("http://x/api/organizations"));

    const whereArg = (orgFindMany.mock.calls[0]?.[0] as {
      where: { id?: string };
    })?.where;
    expect(whereArg?.id).toBe("p-org");
  });
});

// ---------------------------------------------------------------------------
// POST /api/organizations
// ---------------------------------------------------------------------------

describe("POST /api/organizations", () => {
  it("401 for anonymous", async () => {
    mockAnonymous();
    const res = await listPost(
      makeReq("http://x/api/organizations", {
        method: "POST",
        body: { name: "X", type: "INGO", countryScope: "ALL", countryIds: [] },
      }),
    );
    expect(res.status).toBe(401);
    expect(orgCreate).not.toHaveBeenCalled();
  });

  it("403 for PARTNER_ADMIN", async () => {
    mockPartnerAdmin();
    const res = await listPost(
      makeReq("http://x/api/organizations", {
        method: "POST",
        body: {
          name: "Partner-Created",
          type: "LNGO",
          countryScope: "SELECTED",
          countryIds: ["KE"],
        },
      }),
    );
    expect(res.status).toBe(403);
    expect(orgCreate).not.toHaveBeenCalled();
  });

  it("SYSTEM_OWNER: creates SELECTED org, writes join rows, mirrors legacy code", async () => {
    mockSystemOwner();
    orgCreate.mockResolvedValue({ id: "new-org" });
    orgFindUniqueOrThrow.mockResolvedValue({
      id: "new-org",
      name: "Local NGO",
      type: "LNGO",
      countryScope: "SELECTED",
      countryCode: "KE",
      website: null,
      contactEmail: null,
      description: null,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      operatingCountries: [{ countryCode: "KE" }, { countryCode: "TZ" }],
      _count: { projects: 0, users: 0 },
    });

    const res = await listPost(
      makeReq("http://x/api/organizations", {
        method: "POST",
        body: {
          name: "Local NGO",
          type: "LNGO",
          countryScope: "SELECTED",
          countryIds: ["ke", "TZ"],
        },
      }),
    );
    expect(res.status).toBe(201);
    // Org row created with legacy column mirrored to first id.
    const createArg = orgCreate.mock.calls[0]?.[0] as {
      data: { countryScope: string; countryCode: string | null };
    };
    expect(createArg.data.countryScope).toBe("SELECTED");
    expect(createArg.data.countryCode).toBe("KE");
    // Join table cleared then refilled with both ids (uppercased, deduped).
    expect(orgCountryDeleteMany).toHaveBeenCalledWith({
      where: { organizationId: "new-org" },
    });
    const createManyArg = orgCountryCreateMany.mock.calls[0]?.[0] as {
      data: Array<{ organizationId: string; countryCode: string }>;
    };
    expect(createManyArg.data.map((r) => r.countryCode).sort()).toEqual([
      "KE",
      "TZ",
    ]);
    // Audit event emitted with the canonical shape.
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ORGANIZATION_CREATED",
        payload: expect.objectContaining({
          countryScope: "SELECTED",
          countryIds: ["KE", "TZ"],
        }),
      }),
    );
  });

  it("SYSTEM_OWNER: ALL scope clears legacy code and skips createMany", async () => {
    mockSystemOwner();
    orgCreate.mockResolvedValue({ id: "new-org" });
    orgFindUniqueOrThrow.mockResolvedValue({
      id: "new-org",
      name: "Global INGO",
      type: "INGO",
      countryScope: "ALL",
      countryCode: null,
      website: null,
      contactEmail: null,
      description: null,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      operatingCountries: [],
      _count: { projects: 0, users: 0 },
    });

    const res = await listPost(
      makeReq("http://x/api/organizations", {
        method: "POST",
        body: {
          name: "Global INGO",
          type: "INGO",
          countryScope: "ALL",
          countryIds: [],
        },
      }),
    );
    expect(res.status).toBe(201);
    const createArg = orgCreate.mock.calls[0]?.[0] as {
      data: { countryScope: string; countryCode: string | null };
    };
    expect(createArg.data.countryScope).toBe("ALL");
    expect(createArg.data.countryCode).toBeNull();
    // deleteMany still runs (canonicalises state) but createMany is skipped.
    expect(orgCountryDeleteMany).toHaveBeenCalled();
    expect(orgCountryCreateMany).not.toHaveBeenCalled();
  });

  it("400 when SELECTED + empty countryIds", async () => {
    mockSystemOwner();
    const res = await listPost(
      makeReq("http://x/api/organizations", {
        method: "POST",
        body: {
          name: "X",
          type: "INGO",
          countryScope: "SELECTED",
          countryIds: [],
        },
      }),
    );
    expect(res.status).toBe(400);
    expect(orgCreate).not.toHaveBeenCalled();
  });

  it("400 when a supplied country is inactive / soft-deleted", async () => {
    mockSystemOwner();
    // reference table returns only KE, not ZZ.
    countryFindMany.mockResolvedValue([{ code: "KE" }]);

    const res = await listPost(
      makeReq("http://x/api/organizations", {
        method: "POST",
        body: {
          name: "X",
          type: "INGO",
          countryScope: "SELECTED",
          countryIds: ["KE", "ZZ"],
        },
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { details: string[] };
    expect(body.details[0]).toMatch(/ZZ/);
    expect(orgCreate).not.toHaveBeenCalled();
  });

  it("back-compat: legacy { countryCode: 'US' } payload is accepted", async () => {
    mockSystemOwner();
    orgCreate.mockResolvedValue({ id: "new-org" });
    orgFindUniqueOrThrow.mockResolvedValue({
      id: "new-org",
      name: "Legacy",
      type: "LNGO",
      countryScope: "SELECTED",
      countryCode: "US",
      website: null,
      contactEmail: null,
      description: null,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      operatingCountries: [{ countryCode: "US" }],
      _count: { projects: 0, users: 0 },
    });

    const res = await listPost(
      makeReq("http://x/api/organizations", {
        method: "POST",
        body: { name: "Legacy", type: "LNGO", countryCode: "US" },
      }),
    );
    expect(res.status).toBe(201);
    const createManyArg = orgCountryCreateMany.mock.calls[0]?.[0] as {
      data: Array<{ countryCode: string }>;
    };
    expect(createManyArg.data.map((r) => r.countryCode)).toEqual(["US"]);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/organizations/[id]
// ---------------------------------------------------------------------------

describe("PUT /api/organizations/[id]", () => {
  const ctx = { params: Promise.resolve({ id: "org-1" }) };

  it("401 anon / 403 partner", async () => {
    mockAnonymous();
    const r1 = await itemPut(
      makeReq("http://x/api/organizations/org-1", {
        method: "PUT",
        body: { name: "N", type: "INGO", countryScope: "ALL", countryIds: [] },
      }),
      ctx,
    );
    expect(r1.status).toBe(401);

    mockPartnerAdmin();
    const r2 = await itemPut(
      makeReq("http://x/api/organizations/org-1", {
        method: "PUT",
        body: { name: "N", type: "INGO", countryScope: "ALL", countryIds: [] },
      }),
      ctx,
    );
    expect(r2.status).toBe(403);
    expect(orgUpdate).not.toHaveBeenCalled();
  });

  it("404 when the org does not exist", async () => {
    mockSystemOwner();
    orgFindUnique.mockResolvedValue(null);
    const res = await itemPut(
      makeReq("http://x/api/organizations/org-1", {
        method: "PUT",
        body: {
          name: "N",
          type: "INGO",
          countryScope: "SELECTED",
          countryIds: ["US"],
        },
      }),
      ctx,
    );
    expect(res.status).toBe(404);
  });

  it("SYSTEM_OWNER: switching SELECTED → ALL clears the join rows", async () => {
    mockSystemOwner();
    orgFindUnique.mockResolvedValue({ id: "org-1" });
    orgUpdate.mockResolvedValue({ id: "org-1" });
    orgFindUniqueOrThrow.mockResolvedValue({
      id: "org-1",
      name: "Global",
      type: "INGO",
      countryScope: "ALL",
      countryCode: null,
      website: null,
      contactEmail: null,
      description: null,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      operatingCountries: [],
      _count: { projects: 0, users: 0 },
    });

    const res = await itemPut(
      makeReq("http://x/api/organizations/org-1", {
        method: "PUT",
        body: {
          name: "Global",
          type: "INGO",
          countryScope: "ALL",
          countryIds: [],
        },
      }),
      ctx,
    );
    expect(res.status).toBe(200);

    expect(orgUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          countryScope: "ALL",
          countryCode: null,
        }),
      }),
    );
    expect(orgCountryDeleteMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
    });
    expect(orgCountryCreateMany).not.toHaveBeenCalled();
  });

  it("SYSTEM_OWNER: SELECTED + zero countries returns 400", async () => {
    mockSystemOwner();
    orgFindUnique.mockResolvedValue({ id: "org-1" });

    const res = await itemPut(
      makeReq("http://x/api/organizations/org-1", {
        method: "PUT",
        body: {
          name: "Local",
          type: "LNGO",
          countryScope: "SELECTED",
          countryIds: [],
        },
      }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect(orgUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /api/organizations/[id]
// ---------------------------------------------------------------------------

describe("GET /api/organizations/[id]", () => {
  const ctx = { params: Promise.resolve({ id: "org-1" }) };

  it("includes countryScope + countryIds in the single-org payload", async () => {
    mockAnonymous();
    orgFindUnique.mockResolvedValue({
      id: "org-1",
      name: "Plan International",
      type: "INGO",
      countryScope: "ALL",
      countryCode: null,
      website: null,
      contactEmail: null,
      description: null,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      operatingCountries: [],
      _count: { projects: 10, users: 3 },
    });

    const res = await itemGet(
      makeReq("http://x/api/organizations/org-1"),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      organization: { countryScope: string; countryIds: string[] };
    };
    expect(body.organization.countryScope).toBe("ALL");
    expect(body.organization.countryIds).toEqual([]);
  });
});