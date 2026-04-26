import { type NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/**
 * Audit Event API — read-only.
 *
 * Access control:
 *   - Unauthenticated: 401.
 *   - PARTNER_ADMIN:   403 (audit log is SYSTEM_OWNER-only).
 *   - SYSTEM_OWNER:    200 with the requested window of audit events.
 *
 * Query parameters (all optional):
 *   - action       — exact match on AuditEvent.action (e.g. "PROJECT_CREATED")
 *   - entityType   — exact match on AuditEvent.entityType (e.g. "Project")
 *   - entityId     — exact match on AuditEvent.entityId
 *   - actorEmail   — case-insensitive contains match on AuditEvent.actorEmail
 *   - from         — ISO timestamp (inclusive) for AuditEvent.createdAt
 *   - to           — ISO timestamp (inclusive) for AuditEvent.createdAt
 *   - limit        — integer 1..500, default 100
 *
 * Rows are returned newest-first. `payload` is returned verbatim — the UI
 * is expected to render it inside a collapsible JSON viewer.
 */

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { role: true },
    });

    if (!user?.role) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (user.role.role !== "SYSTEM_OWNER") {
      return NextResponse.json(
        { error: "Only system owners can view the audit log" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);

    const action = searchParams.get("action")?.trim() || undefined;
    const entityType = searchParams.get("entityType")?.trim() || undefined;
    const entityId = searchParams.get("entityId")?.trim() || undefined;
    const actorEmail = searchParams.get("actorEmail")?.trim() || undefined;
    const from = parseDate(searchParams.get("from"));
    const to = parseDate(searchParams.get("to"));
    const limit = parseLimit(searchParams.get("limit"));

    const where: Prisma.AuditEventWhereInput = {};
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (actorEmail) {
      where.actorEmail = { contains: actorEmail, mode: "insensitive" };
    }
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }

    const [events, total, actions, entityTypes] = await Promise.all([
      prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          createdAt: true,
          actorId: true,
          actorEmail: true,
          action: true,
          entityType: true,
          entityId: true,
          payload: true,
        },
      }),
      prisma.auditEvent.count({ where }),
      // Facets for the filter UI. Cheap on our volume and help the UI
      // avoid hard-coding the canonical list from AUDIT_ACTIONS (which
      // is a superset — not every action has yet been emitted).
      prisma.auditEvent
        .findMany({
          distinct: ["action"],
          select: { action: true },
          orderBy: { action: "asc" },
        })
        .then((rows) => rows.map((r) => r.action)),
      prisma.auditEvent
        .findMany({
          where: { entityType: { not: null } },
          distinct: ["entityType"],
          select: { entityType: true },
          orderBy: { entityType: "asc" },
        })
        .then((rows) =>
          rows
            .map((r) => r.entityType)
            .filter((v): v is string => typeof v === "string"),
        ),
    ]);

    return NextResponse.json({
      events,
      total,
      limit,
      maxLimit: MAX_LIMIT,
      facets: {
        actions,
        entityTypes,
      },
      appliedFilters: {
        action: action ?? null,
        entityType: entityType ?? null,
        entityId: entityId ?? null,
        actorEmail: actorEmail ?? null,
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
      },
    });
  } catch (error) {
    console.error("[audit-events] GET failed:", error);
    return NextResponse.json(
      { error: "Failed to load audit events" },
      { status: 500 },
    );
  }
}