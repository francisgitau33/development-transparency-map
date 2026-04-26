import { type NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { validateAdministrativeArea } from "@/lib/validation";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";

/**
 * GET /api/reference/administrative-areas
 *
 * Query params:
 * - `activeOnly=true`  → return only active records (default for
 *                        unauthenticated/public callers).
 * - `countryCode=XX`   → scope to a single country.
 *
 * Public callers may only see active records. SYSTEM_OWNERs see everything
 * so the CMS management screen can toggle activation.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnlyParam = searchParams.get("activeOnly");
    const countryCode = searchParams.get("countryCode");

    const session = await getSession();
    let isSystemOwner = false;
    if (session) {
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        include: { role: true },
      });
      isSystemOwner = user?.role?.role === "SYSTEM_OWNER";
    }

    // Non-system-owners are always scoped to active rows. System Owners may
    // request inactive rows with activeOnly=false.
    const activeOnly = isSystemOwner ? activeOnlyParam === "true" : true;

    const where: Prisma.AdministrativeAreaWhereInput = {};
    if (activeOnly) where.active = true;
    if (countryCode) where.countryCode = countryCode.toUpperCase();

    const administrativeAreas = await prisma.administrativeArea.findMany({
      where,
      orderBy: [
        { countryCode: "asc" },
        { sortOrder: "asc" },
        { name: "asc" },
      ],
    });

    return NextResponse.json({ administrativeAreas });
  } catch (error) {
    console.error("Get administrative areas error:", error);
    return NextResponse.json(
      { error: "Failed to fetch administrative areas" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/reference/administrative-areas
 *
 * SYSTEM_OWNER only. Creates a new Administrative Area / District-County row
 * for a given country. Enforces unique (countryCode, name).
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
    const validation = validateAdministrativeArea(data);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.errors },
        { status: 400 },
      );
    }

    const country = await prisma.referenceCountry.findUnique({
      where: { code: validation.normalizedData?.countryCode as string },
    });
    if (!country) {
      return NextResponse.json(
        { error: "Country not found" },
        { status: 400 },
      );
    }
    if (!country.active) {
      return NextResponse.json(
        { error: "Cannot create an administrative area under an inactive country" },
        { status: 400 },
      );
    }

    try {
      const area = await prisma.administrativeArea.create({
        data: validation.normalizedData as never,
      });

      await logAudit({
        actorId: session.userId,
        actorEmail: user.email,
        action: AUDIT_ACTIONS.CMS_UPDATED,
        entityType: "AdministrativeArea",
        entityId: area.id,
        payload: {
          operation: "create",
          name: area.name,
          countryCode: area.countryCode,
        },
      });

      return NextResponse.json({ administrativeArea: area }, { status: 201 });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return NextResponse.json(
          {
            error: `An administrative area named "${validation.normalizedData?.name}" already exists for this country.`,
          },
          { status: 409 },
        );
      }
      throw err;
    }
  } catch (error) {
    console.error("Create administrative area error:", error);
    return NextResponse.json(
      { error: "Failed to create administrative area" },
      { status: 500 },
    );
  }
}