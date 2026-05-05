/**
 * API tests for /api/cms/public-links — SYSTEM_OWNER-managed
 * footer links (LinkedIn, Medium, contact email).
 *
 * Locks in:
 *   - GET is public and returns stored row or empty defaults.
 *   - PUT is SYSTEM_OWNER only (401 anon, 403 PARTNER).
 *   - PUT validates https-only URLs and email shape.
 *   - PUT upserts the singleton row.
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
    CMS_PUBLIC_LINKS_UPDATED: "CMS_PUBLIC_LINKS_UPDATED",
  },
}));

const userFindUnique = vi.fn<(args?: unknown) => Promise<unknown>>();
const linksFindFirst = vi.fn<(args?: unknown) => Promise<unknown>>();
const linksCreate = vi.fn<(args?: unknown) => Promise<unknown>>();
const linksUpdate = vi.fn<(args?: unknown) => Promise<unknown>>();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (a: unknown) => userFindUnique(a) },
    cmsPublicLinks: {
      findFirst: (a: unknown) => linksFindFirst(a),
      create: (a: unknown) => linksCreate(a),
      update: (a: unknown) => linksUpdate(a),
    },
  },
}));

import {
  GET as getRaw,
  PUT as putRaw,
} from "@/app/api/cms/public-links/route";

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
  id: "links-1",
  linkedinUrl: "https://www.linkedin.com/company/foo",
  mediumUrl: null as string | null,
  contactEmail: "hello@example.org",
  updatedAt: new Date("2026-05-06T00:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/cms/public-links", () => {
  it("returns stored row when present", async () => {
    linksFindFirst.mockResolvedValue(STORED);
    const res = await get(makeReq("http://x/api/cms/public-links"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { links: Record<string, unknown> };
    expect(body.links).toMatchObject({
      linkedinUrl: "https://www.linkedin.com/company/foo",
      mediumUrl: null,
      contactEmail: "hello@example.org",
    });
  });

  it("returns empty defaults when no row exists", async () => {
    linksFindFirst.mockResolvedValue(null);
    const res = await get(makeReq("http://x/api/cms/public-links"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { links: Record<string, unknown> };
    expect(body.links).toEqual({
      linkedinUrl: null,
      mediumUrl: null,
      contactEmail: null,
      updatedAt: null,
    });
  });

  it("returns empty links even if DB throws", async () => {
    linksFindFirst.mockRejectedValue(new Error("db down"));
    const res = await get(makeReq("http://x/api/cms/public-links"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { links: Record<string, unknown> };
    expect(body.links.linkedinUrl).toBeNull();
  });
});

describe("PUT /api/cms/public-links", () => {
  it("rejects anonymous callers with 401", async () => {
    mockAnonymous();
    const res = await put(
      makeReq("http://x/api/cms/public-links", {
        method: "PUT",
        body: { linkedinUrl: "https://linkedin.com/x" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects PARTNER_ADMIN with 403", async () => {
    mockPartnerAdmin();
    const res = await put(
      makeReq("http://x/api/cms/public-links", {
        method: "PUT",
        body: { linkedinUrl: "https://linkedin.com/x" },
      }),
    );
    expect(res.status).toBe(403);
    expect(linksCreate).not.toHaveBeenCalled();
    expect(linksUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when URL is not https://", async () => {
    mockSystemOwner();
    const res = await put(
      makeReq("http://x/api/cms/public-links", {
        method: "PUT",
        body: { linkedinUrl: "http://linkedin.com/x" },
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { details: string[] };
    expect(body.details.join(" ")).toMatch(/https/i);
  });

  it("returns 400 on invalid email", async () => {
    mockSystemOwner();
    const res = await put(
      makeReq("http://x/api/cms/public-links", {
        method: "PUT",
        body: { contactEmail: "not-an-email" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("creates a row on first save and returns 200", async () => {
    mockSystemOwner();
    linksFindFirst.mockResolvedValue(null);
    linksCreate.mockResolvedValue({
      ...STORED,
      id: "links-new",
      mediumUrl: "https://medium.com/@bar",
    });
    const res = await put(
      makeReq("http://x/api/cms/public-links", {
        method: "PUT",
        body: {
          linkedinUrl: "https://www.linkedin.com/company/foo",
          mediumUrl: "https://medium.com/@bar",
          contactEmail: "Hello@Example.ORG",
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(linksCreate).toHaveBeenCalledTimes(1);
    // Email must be normalised to lowercase on the way in.
    const createCall = linksCreate.mock.calls[0][0] as { data: { contactEmail: string } };
    expect(createCall.data.contactEmail).toBe("hello@example.org");
    expect(mockLogAudit).toHaveBeenCalledTimes(1);
  });

  it("updates the existing row on subsequent saves", async () => {
    mockSystemOwner();
    linksFindFirst.mockResolvedValue(STORED);
    linksUpdate.mockResolvedValue({ ...STORED, mediumUrl: "https://medium.com/@foo" });
    const res = await put(
      makeReq("http://x/api/cms/public-links", {
        method: "PUT",
        body: {
          linkedinUrl: "https://www.linkedin.com/company/foo",
          mediumUrl: "https://medium.com/@foo",
          contactEmail: "hello@example.org",
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(linksUpdate).toHaveBeenCalledTimes(1);
    expect(linksCreate).not.toHaveBeenCalled();
  });

  it("persists blank fields as null (clears previously-set values)", async () => {
    mockSystemOwner();
    linksFindFirst.mockResolvedValue(STORED);
    linksUpdate.mockResolvedValue({
      ...STORED,
      linkedinUrl: null,
      mediumUrl: null,
      contactEmail: null,
    });
    const res = await put(
      makeReq("http://x/api/cms/public-links", {
        method: "PUT",
        body: {
          linkedinUrl: "",
          mediumUrl: "",
          contactEmail: "",
        },
      }),
    );
    expect(res.status).toBe(200);
    const updateCall = linksUpdate.mock.calls[0][0] as {
      data: { linkedinUrl: string | null; mediumUrl: string | null; contactEmail: string | null };
    };
    expect(updateCall.data.linkedinUrl).toBeNull();
    expect(updateCall.data.mediumUrl).toBeNull();
    expect(updateCall.data.contactEmail).toBeNull();
  });
});