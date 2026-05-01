import { type NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { validateDonor } from "@/lib/validation";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";

/**
 * GET /api/reference/donors
 *
 * Query params:
 * - `activeOnly=true`  → return only active donors (default for public).
 *
 * Public callers always see only active donors. SYSTEM_OWNERs may request
 * inactive donors via activeOnly=false so the CMS can toggle activation.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnlyParam = searchParams.get("activeOnly");
    const includeDeletedParam =
      searchParams.get("includeDeleted") === "true";

    const session = await getSession();
    let isSystemOwner = false;
    if (session) {
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        include: { role: true },
      });
      isSystemOwner = user?.role?.role === "SYSTEM_OWNER";
    }

    const activeOnly = isSystemOwner ? activeOnlyParam === "true" : true;

    const where: Prisma.DonorWhereInput = {};
    if (activeOnly) where.active = true;

    // Soft-deleted rows (`deletedAt != null`) are always hidden from
    // non-system-owner callers. A SYSTEM_OWNER may opt in with
    // `includeDeleted=true` to audit or reactivate rows in future.
    if (!(isSystemOwner && includeDeletedParam)) {
      where.deletedAt = null;
    }

    const donors = await prisma.donor.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({ donors });
  } catch (error) {
    console.error("Get donors error:", error);
    return NextResponse.json(
      { error: "Failed to fetch donors" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/reference/donors
 *
 * SYSTEM_OWNER only. Creates a new donor. Enforces unique name.
 */
export async function POST(request: NextRequest) {
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

    const data = await request.json();
    const validation = validateDonor(data);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.errors },
        { status: 400 },
      );
    }

    try {
      const donor = await prisma.donor.create({
        data: validation.normalizedData as never,
      });

      await logAudit({
        actorId: session.userId,
        actorEmail: user.email,
        action: AUDIT_ACTIONS.CMS_UPDATED,
        entityType: "Donor",
        entityId: donor.id,
        payload: { operation: "create", name: donor.name },
      });

      return NextResponse.json({ donor }, { status: 201 });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return NextResponse.json(
          { error: `A donor named "${validation.normalizedData?.name}" already exists.` },
          { status: 409 },
        );
      }
      throw err;
    }
  } catch (error) {
    console.error("Create donor error:", error);
    return NextResponse.json(
      { error: "Failed to create donor" },
      { status: 500 },
    );
  }
}