import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import {
  countCountryDependencies,
  formatBlockedMessage,
  KIND_LABEL_SINGULAR,
  REFERENCE_ENTITY_TYPE,
} from "@/lib/reference-delete";

/**
 * DELETE /api/reference/countries/:code
 *
 * SYSTEM_OWNER-only soft delete for ReferenceCountry.
 *
 * Behaviour (see src/lib/reference-delete.ts for design rationale):
 *   - 401 for anonymous callers, 403 for PARTNER_ADMINs (they cannot even
 *     see the button but we always re-check server-side).
 *   - 404 if the code is unknown.
 *   - 409 if *live* dependencies exist — active administrative areas,
 *     projects, organizations, or country indicator entries. The response
 *     body carries a structured `dependencies` array so the UI can
 *     reproduce the "Cannot delete country X because it is linked to …"
 *     message verbatim, and a REFERENCE_DELETE_BLOCKED audit entry is
 *     written.
 *   - 200 with `{ ok: true, mode: "soft" }` otherwise. The row stays in the
 *     table (the `code` is a foreign key target and is referenced by
 *     string in Project / Organization) but is flipped to inactive and has
 *     `deletedAt` / `deletedByUserId` stamped so every public filter,
 *     upload template, and dropdown hides it. Already-deleted rows are a
 *     no-op.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { role: true },
    });

    if (user?.role?.role !== "SYSTEM_OWNER") {
      return NextResponse.json(
        { error: "Only system owners can delete reference data" },
        { status: 403 },
      );
    }

    const { code: rawCode } = await params;
    const code = rawCode.toUpperCase();

    const existing = await prisma.referenceCountry.findUnique({
      where: { code },
    });
    if (!existing) {
      return NextResponse.json({ error: "Country not found" }, { status: 404 });
    }

    // Already soft-deleted — respond success (idempotent) but do not emit
    // another audit event.
    if (existing.deletedAt) {
      return NextResponse.json({
        ok: true,
        mode: "soft",
        alreadyDeleted: true,
      });
    }

    const dependencies = await countCountryDependencies(code);
    if (dependencies.total > 0) {
      const message = formatBlockedMessage(
        KIND_LABEL_SINGULAR.country,
        existing.name,
        dependencies,
      );

      await logAudit({
        actorId: session.userId,
        actorEmail: user.email,
        action: AUDIT_ACTIONS.REFERENCE_DELETE_BLOCKED,
        entityType: REFERENCE_ENTITY_TYPE.country,
        entityId: code,
        payload: {
          kind: "country",
          name: existing.name,
          dependencies: dependencies.buckets,
          total: dependencies.total,
        },
      });

      return NextResponse.json(
        {
          error: message,
          code: "REFERENCE_IN_USE",
          dependencies: dependencies.buckets,
        },
        { status: 409 },
      );
    }

    const now = new Date();
    await prisma.referenceCountry.update({
      where: { code },
      data: {
        active: false,
        deletedAt: now,
        deletedByUserId: session.userId,
      },
    });

    await logAudit({
      actorId: session.userId,
      actorEmail: user.email,
      action: AUDIT_ACTIONS.REFERENCE_DELETED,
      entityType: REFERENCE_ENTITY_TYPE.country,
      entityId: code,
      payload: {
        kind: "country",
        name: existing.name,
        mode: "soft",
        deletedAt: now.toISOString(),
      },
    });

    return NextResponse.json({ ok: true, mode: "soft" });
  } catch (error) {
    console.error("Delete country error:", error);
    return NextResponse.json(
      { error: "Failed to delete country" },
      { status: 500 },
    );
  }
}