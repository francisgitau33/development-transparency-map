/**
 * API tests for SYSTEM_OWNER reference-data delete flow
 * (Reference Data Delete — PRD §9.x).
 *
 * Covers all four reference-data DELETE endpoints:
 *   - /api/reference/countries/[code]
 *   - /api/reference/administrative-areas/[id]
 *   - /api/reference/donors/[id]
 *   - /api/reference/sectors/[key]
 *
 * Each endpoint must enforce the same contract:
 *   1. 401 for anonymous, 403 for PARTNER_ADMIN.
 *   2. 404 when the target row is missing.
 *   3. 409 with a structured `dependencies` payload when live usage blocks
 *      deletion — and a REFERENCE_DELETE_BLOCKED audit event is emitted.
 *   4. 200 `{ ok: true, mode: "soft" }` on success; the row is flipped to
 *      `active=false`, stamped with `deletedAt` + `deletedByUserId`, and a
 *      REFERENCE_DELETED audit event is emitted.
 *   5. Idempotency: a second DELETE on an already-soft-deleted row returns
 *      `{ ok: true, mode: "soft", alreadyDeleted: true }` without a new
 *      audit entry.
 *
 * These tests are hermetic — Prisma is mocked per-test. See
 * tests/api/administrative-areas.test.ts for the existing mocking pattern.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// vi.hoisted is required because vi.mock(...) is hoisted to the top of
// the file, so the factory cannot close over plain `const` declarations.
const { mockGetSession, logAudit } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  logAudit: vi.fn(async () => {}),
}));

vi.mock("@/lib/session", () => ({
  getSession: () => mockGetSession(),
}));

vi.mock("@/lib/audit", () => ({
  logAudit,
  AUDIT_ACTIONS: {
    CMS_UPDATED: "CMS_UPDATED",
    REFERENCE_DELETED: "REFERENCE_DELETED",
    REFERENCE_DELETE_BLOCKED: "REFERENCE_DELETE_BLOCKED",
  },
}));

const userFindUnique = vi.fn<(args?: unknown) => Promise<unknown>>();

// Country
const countryFindUnique = vi.fn<(args?: unknown) => Promise<unknown>>();
const countryUpdate = vi.fn<(args?: unknown) => Promise<unknown>>();

// Administrative area
const areaFindUnique = vi.fn<(args?: unknown) => Promise<unknown>>();
const areaUpdate = vi.fn<(args?: unknown) => Promise<unknown>>();

// Donor
const donorFindUnique = vi.fn<(args?: unknown) => Promise<unknown>>();
const donorUpdate = vi.fn<(args?: unknown) => Promise<unknown>>();

// Sector
const sectorFindUnique = vi.fn<(args?: unknown) => Promise<unknown>>();
const sectorUpdate = vi.fn<(args?: unknown) => Promise<unknown>>();

// Dependency counters
const projectCount = vi.fn<(args?: unknown) => Promise<number>>();
const organizationCount = vi.fn<(args?: unknown) => Promise<number>>();
const areaCount = vi.fn<(args?: unknown) => Promise<number>>();
const indicatorCount = vi.fn<(args?: unknown) => Promise<number>>();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (a: unknown) => userFindUnique(a) },
    referenceCountry: {
      findUnique: (a: unknown) => countryFindUnique(a),
      update: (a: unknown) => countryUpdate(a),
    },
    administrativeArea: {
      findUnique: (a: unknown) => areaFindUnique(a),
      update: (a: unknown) => areaUpdate(a),
      count: (a: unknown) => areaCount(a),
    },
    donor: {
      findUnique: (a: unknown) => donorFindUnique(a),
      update: (a: unknown) => donorUpdate(a),
    },
    referenceSector: {
      findUnique: (a: unknown) => sectorFindUnique(a),
      update: (a: unknown) => sectorUpdate(a),
    },
    project: { count: (a: unknown) => projectCount(a) },
    organization: { count: (a: unknown) => organizationCount(a) },
    countryIndicator: { count: (a: unknown) => indicatorCount(a) },
  },
}));

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------

import { DELETE as countryDelete } from "@/app/api/reference/countries/[code]/route";
import { DELETE as areaDelete } from "@/app/api/reference/administrative-areas/[id]/route";
import { DELETE as donorDelete } from "@/app/api/reference/donors/[id]/route";
import { DELETE as sectorDelete } from "@/app/api/reference/sectors/[key]/route";

type DeleteHandler<P extends Record<string, string>> = (
  req: NextRequest,
  ctx: { params: Promise<P> },
) => Promise<NextResponse>;

const countryDeleteT = countryDelete as DeleteHandler<{ code: string }>;
const areaDeleteT = areaDelete as DeleteHandler<{ id: string }>;
const donorDeleteT = donorDelete as DeleteHandler<{ id: string }>;
const sectorDeleteT = sectorDelete as DeleteHandler<{ key: string }>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(url: string): NextRequest {
  return new Request(url, { method: "DELETE" }) as unknown as NextRequest;
}

function mockSystemOwner() {
  mockGetSession.mockResolvedValue({ userId: "u-owner" });
  userFindUnique.mockResolvedValue({
    id: "u-owner",
    email: "owner@test",
    role: { role: "SYSTEM_OWNER" },
  });
}

function mockPartnerAdmin() {
  mockGetSession.mockResolvedValue({ userId: "u-partner" });
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

beforeEach(() => {
  vi.clearAllMocks();
  // Default: zero dependencies (safe to delete). Individual tests override
  // these to test the blocked path.
  projectCount.mockResolvedValue(0);
  organizationCount.mockResolvedValue(0);
  areaCount.mockResolvedValue(0);
  indicatorCount.mockResolvedValue(0);
});

// ---------------------------------------------------------------------------
// DELETE /api/reference/countries/:code
// ---------------------------------------------------------------------------

describe("DELETE /api/reference/countries/:code", () => {
  it("returns 401 for anonymous callers", async () => {
    mockAnon();
    const res = await countryDeleteT(
      makeRequest("http://t/api/reference/countries/LR"),
      { params: Promise.resolve({ code: "LR" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for PARTNER_ADMIN", async () => {
    mockPartnerAdmin();
    const res = await countryDeleteT(
      makeRequest("http://t/api/reference/countries/LR"),
      { params: Promise.resolve({ code: "LR" }) },
    );
    expect(res.status).toBe(403);
    expect(countryUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when the country does not exist", async () => {
    mockSystemOwner();
    countryFindUnique.mockResolvedValue(null);
    const res = await countryDeleteT(
      makeRequest("http://t/api/reference/countries/XX"),
      { params: Promise.resolve({ code: "XX" }) },
    );
    expect(res.status).toBe(404);
  });

  it("blocks with 409 when linked to admin areas and projects", async () => {
    mockSystemOwner();
    countryFindUnique.mockResolvedValue({
      code: "LR",
      name: "Liberia",
      deletedAt: null,
    });
    areaCount.mockResolvedValue(3);
    projectCount.mockResolvedValue(5);
    organizationCount.mockResolvedValue(2);
    indicatorCount.mockResolvedValue(0);

    const res = await countryDeleteT(
      makeRequest("http://t/api/reference/countries/LR"),
      { params: Promise.resolve({ code: "LR" }) },
    );
    expect(res.status).toBe(409);
    const body: any = await res.json();
    expect(body.code).toBe("REFERENCE_IN_USE");
    expect(body.error).toContain("Liberia");
    expect(body.error).toContain("3 administrative areas");
    expect(body.error).toContain("5 projects");
    expect(body.error).toContain("2 organizations");
    // Dependencies array must include per-bucket counts so the UI can
    // render the same message verbatim.
    expect(body.dependencies).toEqual(
      expect.arrayContaining([
        { label: "administrative areas", count: 3 },
        { label: "projects", count: 5 },
        { label: "organizations", count: 2 },
        { label: "country indicator entries", count: 0 },
      ]),
    );
    expect(countryUpdate).not.toHaveBeenCalled();
    // Blocked attempts are audited.
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "REFERENCE_DELETE_BLOCKED",
        entityType: "ReferenceCountry",
        entityId: "LR",
      }),
    );
  });

  it("soft-deletes successfully when no dependencies exist", async () => {
    mockSystemOwner();
    countryFindUnique.mockResolvedValue({
      code: "LR",
      name: "Liberia",
      deletedAt: null,
    });
    countryUpdate.mockResolvedValue({ code: "LR", name: "Liberia" });

    const res = await countryDeleteT(
      makeRequest("http://t/api/reference/countries/LR"),
      { params: Promise.resolve({ code: "LR" }) },
    );
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body).toMatchObject({ ok: true, mode: "soft" });

    // Must flip active + stamp deletedAt + deletedByUserId.
    expect(countryUpdate).toHaveBeenCalledTimes(1);
    const arg: any = countryUpdate.mock.calls[0][0];
    expect(arg.where).toEqual({ code: "LR" });
    expect(arg.data.active).toBe(false);
    expect(arg.data.deletedAt).toBeInstanceOf(Date);
    expect(arg.data.deletedByUserId).toBe("u-owner");

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "REFERENCE_DELETED",
        entityType: "ReferenceCountry",
        entityId: "LR",
        payload: expect.objectContaining({
          kind: "country",
          name: "Liberia",
          mode: "soft",
        }),
      }),
    );
  });

  it("is idempotent on already-soft-deleted rows", async () => {
    mockSystemOwner();
    countryFindUnique.mockResolvedValue({
      code: "LR",
      name: "Liberia",
      deletedAt: new Date("2026-04-28T00:00:00Z"),
    });

    const res = await countryDeleteT(
      makeRequest("http://t/api/reference/countries/LR"),
      { params: Promise.resolve({ code: "LR" }) },
    );
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.alreadyDeleted).toBe(true);
    expect(countryUpdate).not.toHaveBeenCalled();
    // No new audit entry for idempotent no-ops.
    expect(logAudit).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/reference/administrative-areas/:id
// ---------------------------------------------------------------------------

describe("DELETE /api/reference/administrative-areas/:id", () => {
  it("returns 401 for anonymous callers", async () => {
    mockAnon();
    const res = await areaDeleteT(
      makeRequest("http://t/api/reference/administrative-areas/a1"),
      { params: Promise.resolve({ id: "a1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for PARTNER_ADMIN", async () => {
    mockPartnerAdmin();
    const res = await areaDeleteT(
      makeRequest("http://t/api/reference/administrative-areas/a1"),
      { params: Promise.resolve({ id: "a1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("blocks with 409 when projects reference the area", async () => {
    mockSystemOwner();
    areaFindUnique.mockResolvedValue({
      id: "a1",
      name: "Bomi",
      countryCode: "LR",
      deletedAt: null,
    });
    projectCount.mockResolvedValue(7);

    const res = await areaDeleteT(
      makeRequest("http://t/api/reference/administrative-areas/a1"),
      { params: Promise.resolve({ id: "a1" }) },
    );
    expect(res.status).toBe(409);
    const body: any = await res.json();
    expect(body.error).toContain("Bomi");
    expect(body.error).toContain("7 projects");
    expect(body.dependencies).toEqual([
      { label: "projects", count: 7 },
    ]);
    expect(areaUpdate).not.toHaveBeenCalled();
  });

  it("soft-deletes successfully when safe", async () => {
    mockSystemOwner();
    areaFindUnique.mockResolvedValue({
      id: "a1",
      name: "Bomi",
      countryCode: "LR",
      deletedAt: null,
    });
    areaUpdate.mockResolvedValue({ id: "a1" });

    const res = await areaDeleteT(
      makeRequest("http://t/api/reference/administrative-areas/a1"),
      { params: Promise.resolve({ id: "a1" }) },
    );
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body).toMatchObject({ ok: true, mode: "soft" });
    const arg: any = areaUpdate.mock.calls[0][0];
    expect(arg.data.active).toBe(false);
    expect(arg.data.deletedAt).toBeInstanceOf(Date);
    expect(arg.data.deletedByUserId).toBe("u-owner");
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "REFERENCE_DELETED" }),
    );
  });

  it("is idempotent on already-soft-deleted rows", async () => {
    mockSystemOwner();
    areaFindUnique.mockResolvedValue({
      id: "a1",
      name: "Bomi",
      countryCode: "LR",
      deletedAt: new Date(),
    });

    const res = await areaDeleteT(
      makeRequest("http://t/api/reference/administrative-areas/a1"),
      { params: Promise.resolve({ id: "a1" }) },
    );
    expect(res.status).toBe(200);
    expect(areaUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/reference/donors/:id
// ---------------------------------------------------------------------------

describe("DELETE /api/reference/donors/:id", () => {
  it("returns 403 for PARTNER_ADMIN", async () => {
    mockPartnerAdmin();
    const res = await donorDeleteT(
      makeRequest("http://t/api/reference/donors/d1"),
      { params: Promise.resolve({ id: "d1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("blocks with 409 when projects reference the donor", async () => {
    mockSystemOwner();
    donorFindUnique.mockResolvedValue({
      id: "d1",
      name: "USAID",
      deletedAt: null,
    });
    projectCount.mockResolvedValue(12);

    const res = await donorDeleteT(
      makeRequest("http://t/api/reference/donors/d1"),
      { params: Promise.resolve({ id: "d1" }) },
    );
    expect(res.status).toBe(409);
    const body: any = await res.json();
    expect(body.error).toContain("USAID");
    expect(body.error).toContain("12 projects");
    expect(body.dependencies).toEqual([
      { label: "projects", count: 12 },
    ]);
    expect(donorUpdate).not.toHaveBeenCalled();
  });

  it("soft-deletes successfully when safe", async () => {
    mockSystemOwner();
    donorFindUnique.mockResolvedValue({
      id: "d1",
      name: "Small Foundation",
      deletedAt: null,
    });
    donorUpdate.mockResolvedValue({ id: "d1" });

    const res = await donorDeleteT(
      makeRequest("http://t/api/reference/donors/d1"),
      { params: Promise.resolve({ id: "d1" }) },
    );
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body).toMatchObject({ ok: true, mode: "soft" });
    const arg: any = donorUpdate.mock.calls[0][0];
    expect(arg.data.active).toBe(false);
    expect(arg.data.deletedAt).toBeInstanceOf(Date);
    expect(arg.data.deletedByUserId).toBe("u-owner");
  });

  it("uses singular wording for single-project dependency", async () => {
    mockSystemOwner();
    donorFindUnique.mockResolvedValue({
      id: "d1",
      name: "Solo",
      deletedAt: null,
    });
    projectCount.mockResolvedValue(1);

    const res = await donorDeleteT(
      makeRequest("http://t/api/reference/donors/d1"),
      { params: Promise.resolve({ id: "d1" }) },
    );
    expect(res.status).toBe(409);
    const body: any = await res.json();
    expect(body.error).toContain("1 project");
    // And NOT the plural form "1 projects".
    expect(body.error).not.toContain("1 projects");
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/reference/sectors/:key
// ---------------------------------------------------------------------------

describe("DELETE /api/reference/sectors/:key", () => {
  it("returns 403 for PARTNER_ADMIN", async () => {
    mockPartnerAdmin();
    const res = await sectorDeleteT(
      makeRequest("http://t/api/reference/sectors/HEALTH"),
      { params: Promise.resolve({ key: "HEALTH" }) },
    );
    expect(res.status).toBe(403);
  });

  it("blocks with 409 when projects reference the sector", async () => {
    mockSystemOwner();
    sectorFindUnique.mockResolvedValue({
      key: "HEALTH",
      name: "Health",
      deletedAt: null,
    });
    projectCount.mockResolvedValue(4);

    const res = await sectorDeleteT(
      makeRequest("http://t/api/reference/sectors/HEALTH"),
      { params: Promise.resolve({ key: "HEALTH" }) },
    );
    expect(res.status).toBe(409);
    const body: any = await res.json();
    expect(body.error).toContain("Health");
    expect(body.error).toContain("4 projects");
    expect(sectorUpdate).not.toHaveBeenCalled();
  });

  it("soft-deletes successfully when safe", async () => {
    mockSystemOwner();
    sectorFindUnique.mockResolvedValue({
      key: "HEALTH",
      name: "Health",
      deletedAt: null,
    });
    sectorUpdate.mockResolvedValue({ key: "HEALTH" });

    const res = await sectorDeleteT(
      makeRequest("http://t/api/reference/sectors/HEALTH"),
      { params: Promise.resolve({ key: "HEALTH" }) },
    );
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body).toMatchObject({ ok: true, mode: "soft" });
    const arg: any = sectorUpdate.mock.calls[0][0];
    expect(arg.where).toEqual({ key: "HEALTH" });
    expect(arg.data.active).toBe(false);
    expect(arg.data.deletedAt).toBeInstanceOf(Date);
    expect(arg.data.deletedByUserId).toBe("u-owner");
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "REFERENCE_DELETED",
        entityType: "ReferenceSector",
        entityId: "HEALTH",
      }),
    );
  });

  it("uppercases the key from the URL param before queries", async () => {
    mockSystemOwner();
    sectorFindUnique.mockResolvedValue({
      key: "HEALTH",
      name: "Health",
      deletedAt: null,
    });
    sectorUpdate.mockResolvedValue({ key: "HEALTH" });

    await sectorDeleteT(
      makeRequest("http://t/api/reference/sectors/health"),
      { params: Promise.resolve({ key: "health" }) },
    );
    // findUnique must be called with the uppercase key even when the URL
    // is lower-case, matching the behaviour of the PUT endpoint.
    expect(sectorFindUnique).toHaveBeenCalledWith({
      where: { key: "HEALTH" },
    });
  });
});