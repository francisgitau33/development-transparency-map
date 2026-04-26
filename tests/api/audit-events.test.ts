/**
 * API access-control tests for GET /api/audit-events (see Prompt 6 · Part D).
 *
 * Strategy:
 *   - We invoke the route's exported `GET(NextRequest)` directly and inspect
 *     the returned NextResponse. No server is spun up — no DB is touched.
 *   - `@/lib/session` and `@/lib/prisma` are mocked with `vi.mock` at the
 *     top of the file, and the mocks are programmed per test.
 *
 * Coverage:
 *   - Anonymous caller → 401.
 *   - PARTNER_ADMIN → 403.
 *   - SYSTEM_OWNER → 200 with body structure.
 *   - `limit` > 500 is capped at 500.
 *   - Filters are accepted and flowed into the Prisma where clause.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// ----- Mocks (hoisted) -------------------------------------------------------

const mockGetSession = vi.fn();
vi.mock("@/lib/session", () => ({
  getSession: () => mockGetSession(),
}));

const userFindUnique = vi.fn();
const auditEventFindMany = vi.fn();
const auditEventCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    auditEvent: {
      findMany: (...args: unknown[]) => auditEventFindMany(...args),
      count: (...args: unknown[]) => auditEventCount(...args),
    },
  },
}));

// Import AFTER mocks.
import { GET } from "@/app/api/audit-events/route";

function makeReq(url: string): NextRequest {
  return { url } as unknown as NextRequest;
}

beforeEach(() => {
  vi.resetAllMocks();

  // Default facets / counts. Individual tests override.
  auditEventFindMany.mockImplementation(
    async (args: { distinct?: string[] }) => {
      if (args?.distinct) return [];
      return [];
    },
  );
  auditEventCount.mockResolvedValue(0);
});

describe("GET /api/audit-events — access control", () => {
  it("returns 401 for anonymous callers", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET(makeReq("https://app.example/api/audit-events"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("returns 403 for PARTNER_ADMIN", async () => {
    mockGetSession.mockResolvedValue({
      userId: "u-partner",
      email: "partner@example.com",
      displayName: "P",
    });
    userFindUnique.mockResolvedValue({
      id: "u-partner",
      email: "partner@example.com",
      role: { role: "PARTNER_ADMIN", organizationId: "org-1" },
    });

    const res = await GET(makeReq("https://app.example/api/audit-events"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(String(body.error).toLowerCase()).toMatch(
      /owner|only.*system|access/,
    );
    expect(auditEventFindMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: expect.anything() }),
    );
  });

  it("returns 403 for an authenticated user with no role", async () => {
    mockGetSession.mockResolvedValue({
      userId: "u-no-role",
      email: "x@example.com",
      displayName: null,
    });
    userFindUnique.mockResolvedValue({
      id: "u-no-role",
      email: "x@example.com",
      role: null,
    });

    const res = await GET(makeReq("https://app.example/api/audit-events"));
    expect(res.status).toBe(403);
  });

  it("returns 200 and the expected envelope for SYSTEM_OWNER", async () => {
    mockGetSession.mockResolvedValue({
      userId: "u-owner",
      email: "owner@example.com",
      displayName: "O",
    });
    userFindUnique.mockResolvedValue({
      id: "u-owner",
      email: "owner@example.com",
      role: { role: "SYSTEM_OWNER", organizationId: null },
    });

    auditEventFindMany.mockImplementation(
      async (args: { distinct?: string[] }) => {
        if (args?.distinct?.[0] === "action") {
          return [{ action: "LOGIN" }, { action: "PROJECT_CREATED" }];
        }
        if (args?.distinct?.[0] === "entityType") {
          return [{ entityType: "Project" }];
        }
        // Main events query.
        return [
          {
            id: "ev1",
            createdAt: new Date("2025-01-01T00:00:00Z"),
            actorId: "u-owner",
            actorEmail: "owner@example.com",
            action: "LOGIN",
            entityType: null,
            entityId: null,
            payload: null,
          },
        ];
      },
    );
    auditEventCount.mockResolvedValue(1);

    const res = await GET(makeReq("https://app.example/api/audit-events"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.limit).toBe(100);
    expect(body.maxLimit).toBe(500);
    expect(body.facets.actions).toEqual(["LOGIN", "PROJECT_CREATED"]);
    expect(body.facets.entityTypes).toEqual(["Project"]);
    expect(body.appliedFilters).toEqual({
      action: null,
      entityType: null,
      entityId: null,
      actorEmail: null,
      from: null,
      to: null,
    });
  });
});

describe("GET /api/audit-events — filters and limit", () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({
      userId: "u-owner",
      email: "owner@example.com",
      displayName: "O",
    });
    userFindUnique.mockResolvedValue({
      id: "u-owner",
      email: "owner@example.com",
      role: { role: "SYSTEM_OWNER", organizationId: null },
    });
  });

  it("caps limit at 500 when client requests more", async () => {
    await GET(
      makeReq("https://app.example/api/audit-events?limit=9999"),
    );
    // The first findMany call (non-distinct) receives `take`.
    const call = auditEventFindMany.mock.calls.find(
      ([args]) => !args?.distinct,
    ) as [{ take?: number }] | undefined;
    expect(call).toBeDefined();
    expect(call?.[0].take).toBe(500);
  });

  it("defaults limit to 100 when client omits it or sends junk", async () => {
    await GET(makeReq("https://app.example/api/audit-events?limit=abc"));
    const call = auditEventFindMany.mock.calls.find(
      ([args]) => !args?.distinct,
    ) as [{ take?: number }] | undefined;
    expect(call?.[0].take).toBe(100);
  });

  it("flows filters into the where clause", async () => {
    await GET(
      makeReq(
        "https://app.example/api/audit-events?action=LOGIN" +
          "&entityType=Project&entityId=p1" +
          "&actorEmail=owner&from=2025-01-01&to=2025-12-31&limit=50",
      ),
    );

    const call = auditEventFindMany.mock.calls.find(
      ([args]) => !args?.distinct,
    ) as [
      {
        where: {
          action?: string;
          entityType?: string;
          entityId?: string;
          actorEmail?: { contains: string; mode: string };
          createdAt?: { gte?: Date; lte?: Date };
        };
        take: number;
      },
    ] | undefined;

    expect(call).toBeDefined();
    const where = call?.[0].where;
    expect(where?.action).toBe("LOGIN");
    expect(where?.entityType).toBe("Project");
    expect(where?.entityId).toBe("p1");
    expect(where?.actorEmail).toEqual({
      contains: "owner",
      mode: "insensitive",
    });
    expect(where?.createdAt?.gte).toBeInstanceOf(Date);
    expect(where?.createdAt?.lte).toBeInstanceOf(Date);
    expect(call?.[0].take).toBe(50);
  });
});