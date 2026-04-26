import { type NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { validateAdministrativeArea } from "@/lib/validation";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";

/**
 * PUT /api/reference/administrative-areas/:id
 *
 * SYSTEM_OWNER only. Edits name / type / country / active / sort order.
 * Uniqueness on (countryCode, name) is still enforced.
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

    const existing = await prisma.administrativeArea.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Administrative area not found" },
        { status: 404 },
      );
    }

    const validation = validateAdministrativeArea({
      name: data.name ?? existing.name,
      countryCode: data.countryCode ?? existing.countryCode,
      type: data.type ?? existing.type,
      active: data.active ?? existing.active,
      sortOrder: data.sortOrder ?? existing.sortOrder,
    });
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.errors },
        { status: 400 },
      );
    }

    const normalized = validation.normalizedData as Prisma.AdministrativeAreaUncheckedUpdateInput;

    try {
      const area = await prisma.administrativeArea.update({
        where: { id },
        data: normalized,
      });

      await logAudit({
        actorId: session.userId,
        actorEmail: user.email,
        action: AUDIT_ACTIONS.CMS_UPDATED,
        entityType: "AdministrativeArea",
        entityId: area.id,
        payload: {
          operation: "update",
          from: {
            name: existing.name,
            countryCode: existing.countryCode,
            active: existing.active,
          },
          to: {
            name: area.name,
            countryCode: area.countryCode,
            active: area.active,
          },
        },
      });

      return NextResponse.json({ administrativeArea: area });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return NextResponse.json(
          {
            error:
              "An administrative area with that name already exists for this country.",
          },
          { status: 409 },
        );
      }
      throw err;
    }
  } catch (error) {
    console.error("Update administrative area error:", error);
    return NextResponse.json(
      { error: "Failed to update administrative area" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/reference/administrative-areas/:id
 *
 * Soft-delete path: we never hard-delete because projects reference areas.
 * Use PUT with `active=false` for deactivation; this endpoint is reserved
 * for future admin use and returns 409 if projects are linked.
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

    const existing = await prisma.administrativeArea.findUnique({
      where: { id },
      include: { _count: { select: { projects: true } } },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Administrative area not found" },
        { status: 404 },
      );
    }

    if (existing._count.projects > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot delete an administrative area that still has projects. Deactivate it instead.",
        },
        { status: 409 },
      );
    }

    await prisma.administrativeArea.delete({ where: { id } });

    await logAudit({
      actorId: session.userId,
      actorEmail: user.email,
      action: AUDIT_ACTIONS.CMS_UPDATED,
      entityType: "AdministrativeArea",
      entityId: id,
      payload: {
        operation: "delete",
        name: existing.name,
        countryCode: existing.countryCode,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete administrative area error:", error);
    return NextResponse.json(
      { error: "Failed to delete administrative area" },
      { status: 500 },
    );
  }
}