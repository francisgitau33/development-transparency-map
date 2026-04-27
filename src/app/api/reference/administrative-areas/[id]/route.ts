import { type NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { validateAdministrativeArea } from "@/lib/validation";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";

/**
 * PUT /api/reference/administrative-areas/:id
 *
 * SYSTEM_OWNER only. Partial update: any field absent from the request body
 * is preserved from the existing record. Any field present — including
 * `null` — is treated as an intentional change (so a SYSTEM_OWNER can clear
 * a previously-set population by submitting `null`).
 *
 * This merge behaviour is critical because two different client call sites
 * hit this endpoint with different shapes:
 *   1. The Admin Area edit modal sends ALL fields (name, type, countryCode,
 *      active, sortOrder, estimatedPopulation, populationYear,
 *      populationSource, populationSourceUrl, populationNotes).
 *   2. The "Activate / Deactivate" button sends ONLY `{ active }`.
 *
 * Before this refactor, the route re-ran validation against a hand-rolled
 * subset of keys which (a) omitted population fields entirely and (b) coerced
 * every missing field to `null`, silently wiping population metadata on every
 * toggle or edit. See issue #<internal> reported from the live app.
 *
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
    const data = (await request.json()) as Record<string, unknown>;

    const existing = await prisma.administrativeArea.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Administrative area not found" },
        { status: 404 },
      );
    }

    // Merge payload into the existing row. Only keys actually present in the
    // request body override existing values. `null` is a valid intentional
    // clear (e.g. user emptied the Estimated Population field).
    const has = (k: string) =>
      Object.prototype.hasOwnProperty.call(data, k);
    const pick = <T,>(k: string, fallback: T): unknown =>
      has(k) ? (data[k] as unknown) : (fallback as unknown);

    const mergedForValidation: Record<string, unknown> = {
      name: pick("name", existing.name),
      countryCode: pick("countryCode", existing.countryCode),
      type: pick("type", existing.type),
      active: pick("active", existing.active),
      sortOrder: pick("sortOrder", existing.sortOrder),
      estimatedPopulation: pick(
        "estimatedPopulation",
        existing.estimatedPopulation,
      ),
      populationYear: pick("populationYear", existing.populationYear),
      populationSource: pick("populationSource", existing.populationSource),
      populationSourceUrl: pick(
        "populationSourceUrl",
        existing.populationSourceUrl,
      ),
      populationNotes: pick("populationNotes", existing.populationNotes),
    };

    const validation = validateAdministrativeArea(mergedForValidation);
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