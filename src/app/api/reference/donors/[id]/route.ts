import { type NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { validateDonor } from "@/lib/validation";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import {
  countDonorDependencies,
  formatBlockedMessage,
  KIND_LABEL_SINGULAR,
  REFERENCE_ENTITY_TYPE,
} from "@/lib/reference-delete";

/**
 * PUT /api/reference/donors/:id
 *
 * SYSTEM_OWNER only. Updates donor fields (name / type / country / website /
 * active / sort order). Name uniqueness is still enforced.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
        { error: "Only system owners can manage reference data" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const data = await request.json();

    const existing = await prisma.donor.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      // Soft-deleted rows are treated as removed: a PUT must not be able
      // to resurrect or silently modify them.
      return NextResponse.json(
        { error: "Donor not found" },
        { status: 404 },
      );
    }

    const validation = validateDonor({
      name: data.name ?? existing.name,
      donorType: data.donorType ?? existing.donorType,
      countryOfOrigin: data.countryOfOrigin ?? existing.countryOfOrigin,
      website: data.website ?? existing.website,
      active: data.active ?? existing.active,
      sortOrder: data.sortOrder ?? existing.sortOrder,
    });
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.errors },
        { status: 400 },
      );
    }

    const normalized = validation.normalizedData as Prisma.DonorUncheckedUpdateInput;

    try {
      const donor = await prisma.donor.update({
        where: { id },
        data: normalized,
      });

      await logAudit({
        actorId: session.userId,
        actorEmail: user.email,
        action: AUDIT_ACTIONS.CMS_UPDATED,
        entityType: "Donor",
        entityId: donor.id,
        payload: {
          operation: "update",
          from: { name: existing.name, active: existing.active },
          to: { name: donor.name, active: donor.active },
        },
      });

      return NextResponse.json({ donor });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return NextResponse.json(
          { error: "A donor with that name already exists." },
          { status: 409 },
        );
      }
      throw err;
    }
  } catch (error) {
    console.error("Update donor error:", error);
    return NextResponse.json(
      { error: "Failed to update donor" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/reference/donors/:id
 *
 * SYSTEM_OWNER-only soft delete (see src/lib/reference-delete.ts).
 *
 * Donors are referenced by Project.donorId. We never hard-delete because
 * that would orphan project attribution and break "who funds what"
 * reporting. The row is flipped to inactive + `deletedAt` stamped so
 * public filters, upload templates, and partner dropdowns hide it while
 * historical projects keep their donor FK intact.
 *
 * 409 if any project still points to this donor; a structured
 * `dependencies` array is returned so the UI can show
 * "Cannot delete donor X because it is linked to N projects."
 * Idempotent on already-soft-deleted rows.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

    const { id } = await params;

    const existing = await prisma.donor.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Donor not found" }, { status: 404 });
    }

    if (existing.deletedAt) {
      return NextResponse.json({
        ok: true,
        mode: "soft",
        alreadyDeleted: true,
      });
    }

    const dependencies = await countDonorDependencies(id);
    if (dependencies.total > 0) {
      const message = formatBlockedMessage(
        KIND_LABEL_SINGULAR.donor,
        existing.name,
        dependencies,
      );

      await logAudit({
        actorId: session.userId,
        actorEmail: user.email,
        action: AUDIT_ACTIONS.REFERENCE_DELETE_BLOCKED,
        entityType: REFERENCE_ENTITY_TYPE.donor,
        entityId: id,
        payload: {
          kind: "donor",
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
    await prisma.donor.update({
      where: { id },
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
      entityType: REFERENCE_ENTITY_TYPE.donor,
      entityId: id,
      payload: {
        kind: "donor",
        name: existing.name,
        mode: "soft",
        deletedAt: now.toISOString(),
      },
    });

    return NextResponse.json({ ok: true, mode: "soft" });
  } catch (error) {
    console.error("Delete donor error:", error);
    return NextResponse.json(
      { error: "Failed to delete donor" },
      { status: 500 },
    );
  }
}