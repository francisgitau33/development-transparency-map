import { type NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { validateDonor } from "@/lib/validation";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";

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
    if (!existing) {
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
 * Hard-delete only when no projects reference the donor. Otherwise
 * callers should deactivate via PUT { active: false }.
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
        { error: "Only system owners can manage reference data" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const existing = await prisma.donor.findUnique({
      where: { id },
      include: { _count: { select: { projects: true } } },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Donor not found" },
        { status: 404 },
      );
    }

    if (existing._count.projects > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot delete a donor that still has projects. Deactivate it instead.",
        },
        { status: 409 },
      );
    }

    await prisma.donor.delete({ where: { id } });

    await logAudit({
      actorId: session.userId,
      actorEmail: user.email,
      action: AUDIT_ACTIONS.CMS_UPDATED,
      entityType: "Donor",
      entityId: id,
      payload: { operation: "delete", name: existing.name },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete donor error:", error);
    return NextResponse.json(
      { error: "Failed to delete donor" },
      { status: 500 },
    );
  }
}