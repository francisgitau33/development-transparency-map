/**
 * API tests for /api/projects — organization-country scope enforcement on
 * manual single-project create/edit.
 *
 * Context (PRD follow-up to the Multi-country Organizations feature):
 *   The upload route (`/api/upload`) already cross-checks a row's
 *   `countryCode` against the org's `countryScope` / `operatingCountries`.
 *   The manual single-project routes had to be brought into parity so
 *   users could not bypass the rule via the dashboard form.
 *
 * What these tests lock in:
 *   - POST /api/projects
 *       * 401 / 403 for anon / roleless sessions
 *       * ALL-scope org accepts any active country
 *       * SELECTED-scope org rejects an out-of-scope country with 400 and
 *         an "ORGANIZATION_COUNTRY_SCOPE" code
 *       * Legacy single-country (scalar `countryCode`) org still works
 *       * Valid SELECTED org + allowed country still creates
 *       * PARTNER_ADMIN cannot bypass scope by passing another org id
 *   - PUT /api/projects/:id
 *       * Rejects when the country change takes the project out of scope
 *       * Rejects when the org change takes the project out of scope
 *       * Accepts when neither changes (no scope re-check needed)
 *       * PARTNER_ADMIN stays pinned to own org and cannot bypass
 *
 * Hermetic: Prisma is fully mocked, no network, no DB.
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
    PROJECT_CREATED: "PROJECT_CREATED",
    PROJECT_UPDATED: "PROJECT_UPDATED",
    PROJECT_DELETED: "PROJECT_DELETED",
    PROJECT_VISIBILITY_CHANGED: "PROJECT_VISIBILITY_CHANGED",
  },
}));

const userFindUnique = vi.fn<(a?: unknown) => Promise<unknown>>();
const countryFindUnique =
  vi.fn<(a?: unknown) => Promise<unknown>>();
const sectorFindUnique = vi.fn<(a?: unknown) => Promise<unknown>>();
const orgFindUnique = vi.fn<(a?: unknown) => Promise<unknown>>();
const areaFindUnique = vi.fn<(a?: unknown) => Promise<unknown>>();
const donorFindUnique = vi.fn<(a?: unknown) => Promise<unknown>>();
const projectFindUnique = vi.fn<(a?: unknown) => Promise<unknown>>();
const projectCreate = vi.fn<(a?: unknown) => Promise<unknown>>();
const projectUpdate = vi.fn<(a?: unknown) => Promise<unknown>>();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (a: unknown) => userFindUnique(a) },
    referenceCountry: { findUnique: (a: unknown) => countryFindUnique(a) },
    referenceSector: { findUnique: (a: unknown) => sectorFindUnique(a) },
    organization: { findUnique: (a: unknown) => orgFindUnique(a) },
    administrativeArea: {
      findUnique: (a: unknown) => areaFindUnique(a),
    },
    donor: { findUnique: (a: unknown) => donorFindUnique(a) },
    project: {
      findUnique: (a: unknown) => projectFindUnique(a),
      create: (a: unknown) => projectCreate(a),
      update: (a: unknown) => projectUpdate(a),
    },
  },
}));

import { POST as postRaw } from "@/app/api/projects/route";
import { PUT as putRaw } from "@/app/api/projects/[id]/route";

type AnyHandler = (
  req: NextRequest,
  ctx?: { params: Promise<{ id: string }> },
) => Promise<NextResponse>;

const post = postRaw as unknown as AnyHandler;
const put = putRaw as unknown as AnyHandler;

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

function mockPartnerAdmin(orgId: string = "p-org") {
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

const VALID_PROJECT_BODY = {
  title: "A test project",
  description: "Enough text here to pass description validation.",
  sectorKey: "HEALTH",
  status: "ACTIVE",
  startDate: "2025-01-01",
  latitude: -1.2,
  longitude: 36.8,
};

beforeEach(() => {
  vi.clearAllMocks();

  // Default happy-path reference lookups. Individual tests override as
  // needed. Country/sector/admin/donor lookups default to "active, valid".
  countryFindUnique.mockImplementation(async (args: unknown) => {
    const where = (args as { where: { code: string } }).where;
    const code = where.code;
    const lookup: Record<string, { code: string; name: string }> = {
      KE: { code: "KE", name: "Kenya" },
      TZ: { code: "TZ", name: "Tanzania" },
      US: { code: "US", name: "United States" },
      GB: { code: "GB", name: "United Kingdom" },
    };
    const row = lookup[code];
    if (!row) return null;
    return { ...row, active: true, deletedAt: null };
  });

  sectorFindUnique.mockResolvedValue({
    key: "HEALTH",
    name: "Health",
    active: true,
  });

  // Default org: not found. Tests that need one set it up explicitly.
  orgFindUnique.mockResolvedValue(null);
  areaFindUnique.mockResolvedValue(null);
  donorFindUnique.mockResolvedValue(null);
  projectFindUnique.mockResolvedValue(null);
  projectCreate.mockResolvedValue({
    id: "new-project",
    title: VALID_PROJECT_BODY.title,
    organizationId: "org-1",
    countryCode: "KE",
    sectorKey: "HEALTH",
    status: "ACTIVE",
    visibility: "PUBLISHED",
  });
  projectUpdate.mockResolvedValue({
    id: "proj-1",
    title: "Updated",
    organizationId: "org-1",
    countryCode: "KE",
    sectorKey: "HEALTH",
    status: "ACTIVE",
    visibility: "PUBLISHED",
  });
});

// ---------------------------------------------------------------------------
// POST /api/projects — auth gating
// ---------------------------------------------------------------------------

describe("POST /api/projects — auth", () => {
  it("401 for anonymous", async () => {
    mockAnonymous();
    const res = await post(
      makeReq("http://x/api/projects", {
        method: "POST",
        body: { ...VALID_PROJECT_BODY, organizationId: "org-1", countryCode: "KE" },
      }),
    );
    expect(res.status).toBe(401);
    expect(projectCreate).not.toHaveBeenCalled();
  });

  it("403 for authenticated users without a role", async () => {
    mockGetSession.mockResolvedValue({ userId: "u-x" });
    userFindUnique.mockResolvedValue({
      id: "u-x",
      email: "x@example.com",
      role: null,
    });
    const res = await post(
      makeReq("http://x/api/projects", {
        method: "POST",
        body: { ...VALID_PROJECT_BODY, organizationId: "org-1", countryCode: "KE" },
      }),
    );
    expect(res.status).toBe(403);
    expect(projectCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /api/projects — organization country scope
// ---------------------------------------------------------------------------

describe("POST /api/projects — organization country scope", () => {
  it("SYSTEM_OWNER: ALL-scope org accepts any valid country", async () => {
    mockSystemOwner();
    orgFindUnique.mockResolvedValue({
      id: "org-all",
      name: "Global INGO",
      countryScope: "ALL",
      countryCode: null,
      operatingCountries: [],
    });

    const res = await post(
      makeReq("http://x/api/projects", {
        method: "POST",
        body: {
          ...VALID_PROJECT_BODY,
          organizationId: "org-all",
          countryCode: "US",
        },
      }),
    );
    expect(res.status).toBe(201);
    expect(projectCreate).toHaveBeenCalledTimes(1);
  });

  it("SYSTEM_OWNER: SELECTED-scope org rejects a country outside its set", async () => {
    mockSystemOwner();
    orgFindUnique.mockResolvedValue({
      id: "org-ke",
      name: "Kenya-Only NGO",
      countryScope: "SELECTED",
      countryCode: "KE",
      operatingCountries: [{ countryCode: "KE" }],
    });

    const res = await post(
      makeReq("http://x/api/projects", {
        method: "POST",
        body: {
          ...VALID_PROJECT_BODY,
          organizationId: "org-ke",
          countryCode: "US",
        },
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; code?: string };
    expect(body.code).toBe("ORGANIZATION_COUNTRY_SCOPE");
    expect(body.error).toMatch(/not configured to operate/i);
    expect(body.error).toMatch(/Kenya-Only NGO/);
    expect(body.error).toMatch(/United States/);
    expect(projectCreate).not.toHaveBeenCalled();
  });

  it("SYSTEM_OWNER: SELECTED-scope org accepts a country inside its set", async () => {
    mockSystemOwner();
    orgFindUnique.mockResolvedValue({
      id: "org-multi",
      name: "East Africa NGO",
      countryScope: "SELECTED",
      countryCode: "KE",
      operatingCountries: [{ countryCode: "KE" }, { countryCode: "TZ" }],
    });

    const res = await post(
      makeReq("http://x/api/projects", {
        method: "POST",
        body: {
          ...VALID_PROJECT_BODY,
          organizationId: "org-multi",
          countryCode: "TZ",
        },
      }),
    );
    expect(res.status).toBe(201);
    expect(projectCreate).toHaveBeenCalledTimes(1);
  });

  it("legacy single-country org: uses scalar countryCode as scope fallback", async () => {
    mockSystemOwner();
    // `operatingCountries` empty — simulating a row backfilled before the
    // multi-country migration, or a historical org that never had join
    // rows inserted.
    orgFindUnique.mockResolvedValue({
      id: "org-legacy",
      name: "Legacy LNGO",
      countryScope: "SELECTED",
      countryCode: "KE",
      operatingCountries: [],
    });

    const resBlocked = await post(
      makeReq("http://x/api/projects", {
        method: "POST",
        body: {
          ...VALID_PROJECT_BODY,
          organizationId: "org-legacy",
          countryCode: "US",
        },
      }),
    );
    expect(resBlocked.status).toBe(400);
    expect(projectCreate).not.toHaveBeenCalled();

    const resAllowed = await post(
      makeReq("http://x/api/projects", {
        method: "POST",
        body: {
          ...VALID_PROJECT_BODY,
          organizationId: "org-legacy",
          countryCode: "KE",
        },
      }),
    );
    expect(resAllowed.status).toBe(201);
    expect(projectCreate).toHaveBeenCalledTimes(1);
  });

  it("PARTNER_ADMIN: cannot bypass scope by passing another org id", async () => {
    mockPartnerAdmin("p-org");
    // The route is expected to force organizationId to the caller's own
    // org before looking it up. Partner's own org is KE-only; the
    // payload pretends to belong to a US-allowed org.
    orgFindUnique.mockResolvedValue({
      id: "p-org",
      name: "Partner Kenya NGO",
      countryScope: "SELECTED",
      countryCode: "KE",
      operatingCountries: [{ countryCode: "KE" }],
    });

    const res = await post(
      makeReq("http://x/api/projects", {
        method: "POST",
        body: {
          ...VALID_PROJECT_BODY,
          organizationId: "someone-elses-org",
          countryCode: "US",
        },
      }),
    );
    expect(res.status).toBe(400);
    // The org lookup must have been executed against the PARTNER_ADMIN's
    // own org, not the spoofed id.
    const calledIds = orgFindUnique.mock.calls.map(
      (c) => (c?.[0] as { where: { id: string } })?.where?.id,
    );
    expect(calledIds).toContain("p-org");
    expect(calledIds).not.toContain("someone-elses-org");
    expect(projectCreate).not.toHaveBeenCalled();
  });

  it("PARTNER_ADMIN: succeeds when country is in own org's scope", async () => {
    mockPartnerAdmin("p-org");
    orgFindUnique.mockResolvedValue({
      id: "p-org",
      name: "Partner Kenya NGO",
      countryScope: "SELECTED",
      countryCode: "KE",
      operatingCountries: [{ countryCode: "KE" }],
    });

    const res = await post(
      makeReq("http://x/api/projects", {
        method: "POST",
        body: {
          ...VALID_PROJECT_BODY,
          // Even if the partner tries to set another org id, the route
          // forces it back to p-org.
          organizationId: "ignored",
          countryCode: "KE",
        },
      }),
    );
    expect(res.status).toBe(201);
    expect(projectCreate).toHaveBeenCalledTimes(1);
  });

  it("400 when the selected organization is not found", async () => {
    mockSystemOwner();
    orgFindUnique.mockResolvedValue(null);

    const res = await post(
      makeReq("http://x/api/projects", {
        method: "POST",
        body: {
          ...VALID_PROJECT_BODY,
          organizationId: "does-not-exist",
          countryCode: "KE",
        },
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/organization.*not found/i);
    expect(projectCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PUT /api/projects/:id — organization country scope
// ---------------------------------------------------------------------------

describe("PUT /api/projects/:id — organization country scope", () => {
  const ctx = { params: Promise.resolve({ id: "proj-1" }) };

  function mockExistingProject(overrides: Partial<Record<string, unknown>> = {}) {
    projectFindUnique.mockResolvedValue({
      id: "proj-1",
      title: "Original",
      description: "Existing project description.",
      organizationId: "org-ke",
      countryCode: "KE",
      sectorKey: "HEALTH",
      status: "ACTIVE",
      visibility: "PUBLISHED",
      startDate: new Date("2025-01-01"),
      endDate: null,
      latitude: -1.2,
      longitude: 36.8,
      ...overrides,
    });
  }

  it("401 for anonymous", async () => {
    mockAnonymous();
    const res = await put(
      makeReq("http://x/api/projects/proj-1", {
        method: "PUT",
        body: { ...VALID_PROJECT_BODY, organizationId: "org-ke", countryCode: "KE" },
      }),
      ctx,
    );
    expect(res.status).toBe(401);
    expect(projectUpdate).not.toHaveBeenCalled();
  });

  it("rejects a country change that takes the project out of SELECTED-scope", async () => {
    mockSystemOwner();
    mockExistingProject();
    orgFindUnique.mockResolvedValue({
      id: "org-ke",
      name: "Kenya-Only NGO",
      countryScope: "SELECTED",
      countryCode: "KE",
      operatingCountries: [{ countryCode: "KE" }],
    });

    const res = await put(
      makeReq("http://x/api/projects/proj-1", {
        method: "PUT",
        body: {
          ...VALID_PROJECT_BODY,
          organizationId: "org-ke",
          countryCode: "US",
        },
      }),
      ctx,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; code?: string };
    expect(body.code).toBe("ORGANIZATION_COUNTRY_SCOPE");
    expect(body.error).toMatch(/Kenya-Only NGO/);
    expect(projectUpdate).not.toHaveBeenCalled();
  });

  it("rejects an organization change that takes the project out of scope", async () => {
    mockSystemOwner();
    // Existing project is in KE under a flexible org; the edit reassigns
    // it to a US-only org without changing the country.
    mockExistingProject({ organizationId: "org-flex", countryCode: "KE" });
    orgFindUnique.mockResolvedValue({
      id: "org-us-only",
      name: "US-Only Foundation",
      countryScope: "SELECTED",
      countryCode: "US",
      operatingCountries: [{ countryCode: "US" }],
    });

    const res = await put(
      makeReq("http://x/api/projects/proj-1", {
        method: "PUT",
        body: {
          ...VALID_PROJECT_BODY,
          organizationId: "org-us-only",
          countryCode: "KE",
        },
      }),
      ctx,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; code?: string };
    expect(body.code).toBe("ORGANIZATION_COUNTRY_SCOPE");
    expect(body.error).toMatch(/US-Only Foundation/);
    expect(projectUpdate).not.toHaveBeenCalled();
  });

  it("allows an edit when neither org nor country change (no re-check needed)", async () => {
    mockSystemOwner();
    mockExistingProject({ organizationId: "org-ke", countryCode: "KE" });
    // Deliberately do NOT return an org from findUnique — the route
    // must skip the lookup when nothing in scope changed.
    orgFindUnique.mockResolvedValue(null);

    const res = await put(
      makeReq("http://x/api/projects/proj-1", {
        method: "PUT",
        body: {
          ...VALID_PROJECT_BODY,
          organizationId: "org-ke",
          countryCode: "KE",
          title: "Renamed",
        },
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(orgFindUnique).not.toHaveBeenCalled();
    expect(projectUpdate).toHaveBeenCalledTimes(1);
  });

  it("allows an in-scope country change (SELECTED with multiple countries)", async () => {
    mockSystemOwner();
    mockExistingProject({ organizationId: "org-ea", countryCode: "KE" });
    orgFindUnique.mockResolvedValue({
      id: "org-ea",
      name: "East Africa NGO",
      countryScope: "SELECTED",
      countryCode: "KE",
      operatingCountries: [{ countryCode: "KE" }, { countryCode: "TZ" }],
    });

    const res = await put(
      makeReq("http://x/api/projects/proj-1", {
        method: "PUT",
        body: {
          ...VALID_PROJECT_BODY,
          organizationId: "org-ea",
          countryCode: "TZ",
        },
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(projectUpdate).toHaveBeenCalledTimes(1);
  });

  it("PARTNER_ADMIN: cannot bypass scope via PUT with spoofed org id", async () => {
    mockPartnerAdmin("p-org");
    mockExistingProject({ organizationId: "p-org", countryCode: "KE" });
    orgFindUnique.mockResolvedValue({
      id: "p-org",
      name: "Partner Kenya NGO",
      countryScope: "SELECTED",
      countryCode: "KE",
      operatingCountries: [{ countryCode: "KE" }],
    });

    const res = await put(
      makeReq("http://x/api/projects/proj-1", {
        method: "PUT",
        body: {
          ...VALID_PROJECT_BODY,
          // Spoofed — route should force back to own org.
          organizationId: "evil-other-org",
          countryCode: "US",
        },
      }),
      ctx,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; code?: string };
    expect(body.code).toBe("ORGANIZATION_COUNTRY_SCOPE");
    // Scope lookup must have been executed against the partner's real
    // org, not the spoofed one.
    const calledIds = orgFindUnique.mock.calls.map(
      (c) => (c?.[0] as { where: { id: string } })?.where?.id,
    );
    expect(calledIds).toContain("p-org");
    expect(calledIds).not.toContain("evil-other-org");
    expect(projectUpdate).not.toHaveBeenCalled();
  });

  it("403 when PARTNER_ADMIN tries to edit a project outside their org", async () => {
    mockPartnerAdmin("p-org");
    mockExistingProject({ organizationId: "some-other-org", countryCode: "KE" });

    const res = await put(
      makeReq("http://x/api/projects/proj-1", {
        method: "PUT",
        body: {
          ...VALID_PROJECT_BODY,
          organizationId: "some-other-org",
          countryCode: "KE",
        },
      }),
      ctx,
    );
    expect(res.status).toBe(403);
    expect(projectUpdate).not.toHaveBeenCalled();
  });

  it("ALL-scope org accepts any country change", async () => {
    mockSystemOwner();
    mockExistingProject({ organizationId: "org-global", countryCode: "KE" });
    orgFindUnique.mockResolvedValue({
      id: "org-global",
      name: "Global INGO",
      countryScope: "ALL",
      countryCode: null,
      operatingCountries: [],
    });

    const res = await put(
      makeReq("http://x/api/projects/proj-1", {
        method: "PUT",
        body: {
          ...VALID_PROJECT_BODY,
          organizationId: "org-global",
          countryCode: "GB",
        },
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(projectUpdate).toHaveBeenCalledTimes(1);
  });
});