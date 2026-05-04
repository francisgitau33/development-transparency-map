/**
 * API tests for /api/team — the CMS-managed public "Our Team" list.
 *
 * Locks in:
 *   - GET returns only active rows to anonymous callers.
 *   - GET ?all=true is honored for SYSTEM_OWNER only; PARTNER_ADMIN and
 *     anonymous still see only active rows.
 *   - POST / PUT / DELETE are SYSTEM_OWNER only (401 anon, 403 PARTNER).
 *   - POST / PUT normalise URLs and reject non-http(s) values.
 *   - DELETE is a simple hard delete (no dependency guard).
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
    TEAM_MEMBER_CREATED: "TEAM_MEMBER_CREATED",
    TEAM_MEMBER_UPDATED: "TEAM_MEMBER_UPDATED",
    TEAM_MEMBER_DELETED: "TEAM_MEMBER_DELETED",
  },
}));

const userFindUnique = vi.fn<(args?: unknown) => Promise<unknown>>();
const teamFindMany = vi.fn<(args?: unknown) => Promise<unknown[]>>();
const teamFindUnique = vi.fn<(args?: unknown) => Promise<unknown>>();
const teamCreate = vi.fn<(args?: unknown) => Promise<unknown>>();
const teamUpdate = vi.fn<(args?: unknown) => Promise<unknown>>();
const teamDelete = vi.fn<(args?: unknown) => Promise<unknown>>();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (a: unknown) => userFindUnique(a) },
    teamMember: {
      findMany: (a: unknown) => teamFindMany(a),
      findUnique: (a: unknown) => teamFindUnique(a),
      create: (a: unknown) => teamCreate(a),
      update: (a: unknown) => teamUpdate(a),
      delete: (a: unknown) => teamDelete(a),
    },
  },
}));

import {
  GET as listGetRaw,
  POST as listPostRaw,
} from "@/app/api/team/route";
import {
  PUT as itemPutRaw,
  DELETE as itemDeleteRaw,
} from "@/app/api/team/[id]/route";

type AnyHandler = (
  req: NextRequest,
  ctx?: { params: Promise<{ id: string }> },
) => Promise<NextResponse>;

const listGet = listGetRaw as unknown as AnyHandler;
const listPost = listPostRaw as unknown as AnyHandler;
const itemPut = itemPutRaw as unknown as AnyHandler;
const itemDelete = itemDeleteRaw as unknown as AnyHandler;

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

const ACTIVE_MEMBER = {
  id: "tm-1",
  name: "Ada",
  role: "Advisor",
  bio: null,
  photoUrl: null,
  photoData: null,
  photoMimeType: null,
  linkedinUrl: null,
  displayOrder: 0,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const INACTIVE_MEMBER = { ...ACTIVE_MEMBER, id: "tm-2", name: "Grace", active: false };

// Tiny real-looking PNG / JPEG payloads used by POST/PUT tests. These
// only need to pass the server's magic-byte sniffer; they are never
// decoded as images.
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const JPEG_B64 = JPEG_BYTES.toString("base64");
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);
const PNG_B64 = PNG_BYTES.toString("base64");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/team", () => {
  it("returns only active rows to anonymous callers", async () => {
    mockAnonymous();
    teamFindMany.mockResolvedValue([ACTIVE_MEMBER]);
    const res = await listGet(makeReq("http://x/api/team"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { members: unknown[] };
    expect(body.members).toHaveLength(1);
    expect(teamFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true } }),
    );
  });

  it("ignores ?all=true for PARTNER_ADMIN (still active-only)", async () => {
    mockPartnerAdmin();
    teamFindMany.mockResolvedValue([ACTIVE_MEMBER]);
    const res = await listGet(makeReq("http://x/api/team?all=true"));
    expect(res.status).toBe(200);
    expect(teamFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true } }),
    );
  });

  it("honors ?all=true for SYSTEM_OWNER (includes inactive)", async () => {
    mockSystemOwner();
    teamFindMany.mockResolvedValue([ACTIVE_MEMBER, INACTIVE_MEMBER]);
    const res = await listGet(makeReq("http://x/api/team?all=true"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { members: unknown[] };
    expect(body.members).toHaveLength(2);
    expect(teamFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });
});

describe("POST /api/team", () => {
  it("rejects anonymous callers (401)", async () => {
    mockAnonymous();
    const res = await listPost(
      makeReq("http://x/api/team", {
        method: "POST",
        body: { name: "Ada", role: "Advisor" },
      }),
    );
    expect(res.status).toBe(401);
    expect(teamCreate).not.toHaveBeenCalled();
  });

  it("rejects PARTNER_ADMIN (403)", async () => {
    mockPartnerAdmin();
    const res = await listPost(
      makeReq("http://x/api/team", {
        method: "POST",
        body: {
          name: "Ada",
          role: "Advisor",
          photoBase64: JPEG_B64,
          photoMimeType: "image/jpeg",
        },
      }),
    );
    expect(res.status).toBe(403);
    expect(teamCreate).not.toHaveBeenCalled();
  });

  it("returns 400 on validation failure and does not write", async () => {
    mockSystemOwner();
    const res = await listPost(
      makeReq("http://x/api/team", {
        method: "POST",
        body: {
          name: "",
          role: "",
          photoBase64: JPEG_B64,
          photoMimeType: "image/jpeg",
        },
      }),
    );
    expect(res.status).toBe(400);
    expect(teamCreate).not.toHaveBeenCalled();
  });

  it("rejects non-http(s) photo URLs (400)", async () => {
    mockSystemOwner();
    const res = await listPost(
      makeReq("http://x/api/team", {
        method: "POST",
        body: {
          name: "Ada",
          role: "Advisor",
          photoUrl: "javascript:alert(1)",
          photoBase64: JPEG_B64,
          photoMimeType: "image/jpeg",
        },
      }),
    );
    expect(res.status).toBe(400);
    expect(teamCreate).not.toHaveBeenCalled();
  });

  it("rejects POST when photo is missing (photo required on create)", async () => {
    mockSystemOwner();
    const res = await listPost(
      makeReq("http://x/api/team", {
        method: "POST",
        body: { name: "Ada", role: "Advisor" },
      }),
    );
    expect(res.status).toBe(400);
    expect(teamCreate).not.toHaveBeenCalled();
  });

  it("rejects POST when photo MIME is not JPEG/PNG", async () => {
    mockSystemOwner();
    const res = await listPost(
      makeReq("http://x/api/team", {
        method: "POST",
        body: {
          name: "Ada",
          role: "Advisor",
          photoBase64: JPEG_B64,
          photoMimeType: "image/svg+xml",
        },
      }),
    );
    expect(res.status).toBe(400);
    expect(teamCreate).not.toHaveBeenCalled();
  });

  it("rejects POST when bytes don't match the claimed MIME", async () => {
    mockSystemOwner();
    // Claim PNG but send JPEG bytes — magic-byte sniff rejects.
    const res = await listPost(
      makeReq("http://x/api/team", {
        method: "POST",
        body: {
          name: "Ada",
          role: "Advisor",
          photoBase64: JPEG_B64,
          photoMimeType: "image/png",
        },
      }),
    );
    expect(res.status).toBe(400);
    expect(teamCreate).not.toHaveBeenCalled();
  });

  it("creates a valid row with uploaded JPEG and audits TEAM_MEMBER_CREATED", async () => {
    mockSystemOwner();
    teamCreate.mockResolvedValue({
      ...ACTIVE_MEMBER,
      id: "tm-new",
      name: "Ada",
      role: "Advisor",
      photoMimeType: "image/jpeg",
      photoData: JPEG_BYTES,
    });
    const res = await listPost(
      makeReq("http://x/api/team", {
        method: "POST",
        body: {
          name: "Ada",
          role: "Advisor",
          photoBase64: JPEG_B64,
          photoMimeType: "image/jpeg",
          displayOrder: 3,
          active: true,
        },
      }),
    );
    expect(res.status).toBe(201);
    expect(teamCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Ada",
          role: "Advisor",
          photoMimeType: "image/jpeg",
          displayOrder: 3,
          active: true,
        }),
      }),
    );
    // Response exposes hasPhoto but never raw bytes.
    const body = (await res.json()) as {
      member: { hasPhoto: boolean; photoData?: unknown };
    };
    expect(body.member.hasPhoto).toBe(true);
    expect(body.member.photoData).toBeUndefined();
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "TEAM_MEMBER_CREATED" }),
    );
  });

  it("accepts PNG bytes with image/png MIME", async () => {
    mockSystemOwner();
    teamCreate.mockResolvedValue({
      ...ACTIVE_MEMBER,
      id: "tm-new",
      photoMimeType: "image/png",
      photoData: PNG_BYTES,
    });
    const res = await listPost(
      makeReq("http://x/api/team", {
        method: "POST",
        body: {
          name: "Ada",
          role: "Advisor",
          photoBase64: PNG_B64,
          photoMimeType: "image/png",
        },
      }),
    );
    expect(res.status).toBe(201);
  });
});

describe("DELETE /api/team/[id]", () => {
  const ctx = { params: Promise.resolve({ id: "tm-1" }) };

  it("rejects anonymous callers (401)", async () => {
    mockAnonymous();
    const res = await itemDelete(
      makeReq("http://x/api/team/tm-1", { method: "DELETE" }),
      ctx,
    );
    expect(res.status).toBe(401);
    expect(teamDelete).not.toHaveBeenCalled();
  });

  it("rejects PARTNER_ADMIN (403)", async () => {
    mockPartnerAdmin();
    const res = await itemDelete(
      makeReq("http://x/api/team/tm-1", { method: "DELETE" }),
      ctx,
    );
    expect(res.status).toBe(403);
    expect(teamDelete).not.toHaveBeenCalled();
  });

  it("returns 404 when member does not exist", async () => {
    mockSystemOwner();
    teamFindUnique.mockResolvedValue(null);
    const res = await itemDelete(
      makeReq("http://x/api/team/tm-1", { method: "DELETE" }),
      ctx,
    );
    expect(res.status).toBe(404);
    expect(teamDelete).not.toHaveBeenCalled();
  });

  it("hard deletes and audits TEAM_MEMBER_DELETED", async () => {
    mockSystemOwner();
    teamFindUnique.mockResolvedValue({ ...ACTIVE_MEMBER });
    teamDelete.mockResolvedValue({ id: "tm-1" });
    const res = await itemDelete(
      makeReq("http://x/api/team/tm-1", { method: "DELETE" }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(teamDelete).toHaveBeenCalledWith({ where: { id: "tm-1" } });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "TEAM_MEMBER_DELETED" }),
    );
  });
});

describe("PUT /api/team/[id]", () => {
  const ctx = { params: Promise.resolve({ id: "tm-1" }) };

  it("rejects PARTNER_ADMIN (403)", async () => {
    mockPartnerAdmin();
    const res = await itemPut(
      makeReq("http://x/api/team/tm-1", {
        method: "PUT",
        body: { name: "Ada", role: "Advisor" },
      }),
      ctx,
    );
    expect(res.status).toBe(403);
    expect(teamUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when member does not exist", async () => {
    mockSystemOwner();
    teamFindUnique.mockResolvedValue(null);
    const res = await itemPut(
      makeReq("http://x/api/team/tm-1", {
        method: "PUT",
        body: { name: "Ada", role: "Advisor" },
      }),
      ctx,
    );
    expect(res.status).toBe(404);
    expect(teamUpdate).not.toHaveBeenCalled();
  });

  it("updates active=false to hide a member", async () => {
    mockSystemOwner();
    teamFindUnique.mockResolvedValue({ ...ACTIVE_MEMBER });
    teamUpdate.mockResolvedValue({ ...ACTIVE_MEMBER, active: false });
    const res = await itemPut(
      makeReq("http://x/api/team/tm-1", {
        method: "PUT",
        body: { name: "Ada", role: "Advisor", active: false },
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(teamUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tm-1" },
        data: expect.objectContaining({ active: false }),
      }),
    );
  });

  it("preserves existing photo when PUT body omits photoBase64", async () => {
    mockSystemOwner();
    teamFindUnique.mockResolvedValue({
      ...ACTIVE_MEMBER,
      photoData: JPEG_BYTES,
      photoMimeType: "image/jpeg",
    });
    teamUpdate.mockResolvedValue({ ...ACTIVE_MEMBER, name: "Ada Lovelace" });
    const res = await itemPut(
      makeReq("http://x/api/team/tm-1", {
        method: "PUT",
        body: { name: "Ada Lovelace", role: "Advisor" },
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    const updateArgs = teamUpdate.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    // Neither photoData nor photoMimeType is passed through when the
    // request did not include a replacement.
    expect(updateArgs.data).not.toHaveProperty("photoData");
    expect(updateArgs.data).not.toHaveProperty("photoMimeType");
  });

  it("replaces photo when PUT body includes valid photoBase64", async () => {
    mockSystemOwner();
    teamFindUnique.mockResolvedValue({ ...ACTIVE_MEMBER });
    teamUpdate.mockResolvedValue({
      ...ACTIVE_MEMBER,
      photoMimeType: "image/png",
      photoData: PNG_BYTES,
    });
    const res = await itemPut(
      makeReq("http://x/api/team/tm-1", {
        method: "PUT",
        body: {
          name: "Ada",
          role: "Advisor",
          photoBase64: PNG_B64,
          photoMimeType: "image/png",
        },
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    const updateArgs = teamUpdate.mock.calls[0]?.[0] as {
      data: { photoMimeType: string; photoData: Buffer };
    };
    expect(updateArgs.data.photoMimeType).toBe("image/png");
    expect(Buffer.isBuffer(updateArgs.data.photoData)).toBe(true);
  });

  it("rejects PUT with a bad photo payload (400)", async () => {
    mockSystemOwner();
    teamFindUnique.mockResolvedValue({ ...ACTIVE_MEMBER });
    const res = await itemPut(
      makeReq("http://x/api/team/tm-1", {
        method: "PUT",
        body: {
          name: "Ada",
          role: "Advisor",
          // PNG bytes but JPEG MIME — magic-byte sniff fails.
          photoBase64: PNG_B64,
          photoMimeType: "image/jpeg",
        },
      }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect(teamUpdate).not.toHaveBeenCalled();
  });
});