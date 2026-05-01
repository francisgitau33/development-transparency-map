import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import {
  countSectorDependencies,
  formatBlockedMessage,
  KIND_LABEL_SINGULAR,
  REFERENCE_ENTITY_TYPE,
} from "@/lib/reference-delete";

/**
 * DELETE /api/reference/sectors/:key
 *
 * SYSTEM_OWNER-only soft delete for ReferenceSector. The semantics match
 * the country / donor endpoints (see src/lib/reference-delete.ts):
 *
 *   - 401 / 403 for unauthenticated / non-system-owner callers.
 *   - 404 if the key is unknown.
 *   - 409 if any live Project.sectorKey still references the sector.
 *     The UI surfaces the count ("Cannot delete sector X because it is
 *     linked to 7 projects"); a REFERENCE_DELETE_BLOCKED audit row is
 *     written.
 *   - 200 `{ ok: true, mode: "soft" }` otherwise. The row is flipped to
 *     inactive with `deletedAt` + `deletedByUserId` stamped so it stops
 *     appearing in the public map legend, upload sector picker, and
 *     project-form dropdowns. Historical projects keep rendering because
 *     `sectorKey` is stored as a string, not a hard FK.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
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

    const { key: rawKey } = await params;
    const key = rawKey.toUpperCase();

    const existing = await prisma.referenceSector.findUnique({
      where: { key },
    });
    if (!existing) {
      return NextResponse.json({ error: "Sector not found" }, { status: 404 });
    }

    if (existing.deletedAt) {
      return NextResponse.json({
        ok: true,
        mode: "soft",
        alreadyDeleted: true,
      });
    }

    const dependencies = await countSectorDependencies(key);
    if (dependencies.total > 0) {
      const message = formatBlockedMessage(
        KIND_LABEL_SINGULAR.sector,
        existing.name,
        dependencies,
      );

      await logAudit({
        actorId: session.userId,
        actorEmail: user.email,
        action: AUDIT_ACTIONS.REFERENCE_DELETE_BLOCKED,
        entityType: REFERENCE_ENTITY_TYPE.sector,
        entityId: key,
        payload: {
          kind: "sector",
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
    await prisma.referenceSector.update({
      where: { key },
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
      entityType: REFERENCE_ENTITY_TYPE.sector,
      entityId: key,
      payload: {
        kind: "sector",
        name: existing.name,
        mode: "soft",
        deletedAt: now.toISOString(),
      },
    });

    return NextResponse.json({ ok: true, mode: "soft" });
  } catch (error) {
    console.error("Delete sector error:", error);
    return NextResponse.json(
      { error: "Failed to delete sector" },
      { status: 500 },
    );
  }
}