import { type NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { validateAdministrativeArea } from "@/lib/validation";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import {
  countAdministrativeAreaDependencies,
  formatBlockedMessage,
  KIND_LABEL_SINGULAR,
  REFERENCE_ENTITY_TYPE,
} from "@/lib/reference-delete";

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
    if (!existing || existing.deletedAt) {
      // Soft-deleted rows are treated as removed. A PUT must not be able
      // to resurrect or silently modify them.
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
 * SYSTEM_OWNER-only soft delete (see src/lib/reference-delete.ts).
 *
 * Administrative areas are referenced by Project.administrativeAreaId.
 * We never hard-delete because projects reference areas — hard delete
 * would orphan them and break per-area analytics. The row is flipped to
 * inactive + `deletedAt` stamped so every public GET, upload template,
 * and project-form dropdown hides it. Historical projects keep the FK
 * intact.
 *
 * 409 if any project still points to this area (the confirmation modal
 * surfaces the count via the returned `dependencies` array). Idempotent
 * on already-soft-deleted rows.
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

    const existing = await prisma.administrativeArea.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Administrative area not found" },
        { status: 404 },
      );
    }

    if (existing.deletedAt) {
      return NextResponse.json({
        ok: true,
        mode: "soft",
        alreadyDeleted: true,
      });
    }

    const dependencies = await countAdministrativeAreaDependencies(id);
    if (dependencies.total > 0) {
      const message = formatBlockedMessage(
        KIND_LABEL_SINGULAR["administrative-area"],
        existing.name,
        dependencies,
      );

      await logAudit({
        actorId: session.userId,
        actorEmail: user.email,
        action: AUDIT_ACTIONS.REFERENCE_DELETE_BLOCKED,
        entityType: REFERENCE_ENTITY_TYPE["administrative-area"],
        entityId: id,
        payload: {
          kind: "administrative-area",
          name: existing.name,
          countryCode: existing.countryCode,
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
    await prisma.administrativeArea.update({
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
      entityType: REFERENCE_ENTITY_TYPE["administrative-area"],
      entityId: id,
      payload: {
        kind: "administrative-area",
        name: existing.name,
        countryCode: existing.countryCode,
        mode: "soft",
        deletedAt: now.toISOString(),
      },
    });

    return NextResponse.json({ ok: true, mode: "soft" });
  } catch (error) {
    console.error("Delete administrative area error:", error);
    return NextResponse.json(
      { error: "Failed to delete administrative area" },
      { status: 500 },
    );
  }
}