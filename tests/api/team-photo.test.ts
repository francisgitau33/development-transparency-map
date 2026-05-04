/**
 * Tests for GET /api/team/[id]/photo — the dedicated public endpoint
 * that streams uploaded team-member photo bytes.
 *
 * Locks in:
 *   - 404 when the id is unknown.
 *   - 404 when the row exists but has no uploaded bytes / MIME type
 *     (legacy rows whose photo is a plain URL).
 *   - 200 with the correct Content-Type + body bytes when present.
 *   - No authentication required (photos render on a public page).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest, NextResponse } from "next/server";

const teamFindUnique = vi.fn<(args?: unknown) => Promise<unknown>>();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    teamMember: {
      findUnique: (a: unknown) => teamFindUnique(a),
    },
  },
}));

import { GET as photoGetRaw } from "@/app/api/team/[id]/photo/route";

type Handler = (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => Promise<NextResponse>;

const photoGet = photoGetRaw as unknown as Handler;

function makeReq(url: string): NextRequest {
  return new Request(url) as unknown as NextRequest;
}

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02,
]);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/team/[id]/photo", () => {
  const ctx = { params: Promise.resolve({ id: "tm-1" }) };

  it("returns 404 when the team member does not exist", async () => {
    teamFindUnique.mockResolvedValue(null);
    const res = await photoGet(makeReq("http://x/api/team/tm-1/photo"), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 404 when the row has no uploaded bytes", async () => {
    teamFindUnique.mockResolvedValue({
      photoData: null,
      photoMimeType: null,
    });
    const res = await photoGet(makeReq("http://x/api/team/tm-1/photo"), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 404 when bytes exist but MIME is missing (defensive)", async () => {
    teamFindUnique.mockResolvedValue({
      photoData: PNG_BYTES,
      photoMimeType: null,
    });
    const res = await photoGet(makeReq("http://x/api/team/tm-1/photo"), ctx);
    expect(res.status).toBe(404);
  });

  it("streams bytes with the stored Content-Type", async () => {
    teamFindUnique.mockResolvedValue({
      photoData: PNG_BYTES,
      photoMimeType: "image/png",
    });
    const res = await photoGet(makeReq("http://x/api/team/tm-1/photo"), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const arr = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(arr)).toEqual(Array.from(PNG_BYTES));
  });
});