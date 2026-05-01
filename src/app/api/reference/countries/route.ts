import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { validateCountry } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("activeOnly") === "true";
    const includeDeletedParam =
      searchParams.get("includeDeleted") === "true";

    // Only SYSTEM_OWNERs may opt in to seeing soft-deleted rows. Every other
    // caller — including PARTNER_ADMINs, public map visitors, and upload
    // tooling — always has `deletedAt != null` rows hidden.
    let canIncludeDeleted = false;
    if (includeDeletedParam) {
      const session = await getSession();
      if (session) {
        const user = await prisma.user.findUnique({
          where: { id: session.userId },
          include: { role: true },
        });
        canIncludeDeleted = user?.role?.role === "SYSTEM_OWNER";
      }
    }

    const where: Record<string, unknown> = {};
    if (activeOnly) {
      where.active = true;
    }
    if (!canIncludeDeleted) {
      where.deletedAt = null;
    }

    const countries = await prisma.referenceCountry.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({ countries });
  } catch (error) {
    console.error("Get countries error:", error);
    return NextResponse.json(
      { error: "Failed to fetch countries" },
      { status: 500 }
    );
  }
}

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
        { status: 403 }
      );
    }

    const data = await request.json();

    const validation = validateCountry(data);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.errors },
        { status: 400 }
      );
    }

    const existing = await prisma.referenceCountry.findUnique({
      where: { code: validation.normalizedData?.code as string },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Country code already exists" },
        { status: 409 }
      );
    }

    const country = await prisma.referenceCountry.create({
      data: validation.normalizedData as never,
    });

    return NextResponse.json({ country }, { status: 201 });
  } catch (error) {
    console.error("Create country error:", error);
    return NextResponse.json(
      { error: "Failed to create country" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
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
        { status: 403 }
      );
    }

    const data = await request.json();
    const { code, ...updateData } = data;

    if (!code) {
      return NextResponse.json(
        { error: "Country code is required" },
        { status: 400 }
      );
    }

    // Guard: soft-deleted rows cannot be edited. Restore is intentionally
    // not exposed in the current UI — a deleted country should be treated
    // as removed. Trying to PUT on one returns 404 so the CMS surfaces
    // "not found" instead of silently resurrecting data.
    const existing = await prisma.referenceCountry.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!existing || existing.deletedAt) {
      return NextResponse.json(
        { error: "Country not found" },
        { status: 404 }
      );
    }

    const country = await prisma.referenceCountry.update({
      where: { code: code.toUpperCase() },
      data: {
        name: updateData.name?.trim(),
        type: updateData.type?.toUpperCase(),
        active: updateData.active,
        sortOrder: updateData.sortOrder,
      },
    });

    return NextResponse.json({ country });
  } catch (error) {
    console.error("Update country error:", error);
    return NextResponse.json(
      { error: "Failed to update country" },
      { status: 500 }
    );
  }
}