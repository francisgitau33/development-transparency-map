import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { validateSector } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("activeOnly") === "true";

    const where: Record<string, unknown> = {};
    if (activeOnly) {
      where.active = true;
    }

    const sectors = await prisma.referenceSector.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({ sectors });
  } catch (error) {
    console.error("Get sectors error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sectors" },
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

    const validation = validateSector(data);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.errors },
        { status: 400 }
      );
    }

    const existing = await prisma.referenceSector.findUnique({
      where: { key: validation.normalizedData!.key as string },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Sector key already exists" },
        { status: 409 }
      );
    }

    const sector = await prisma.referenceSector.create({
      data: validation.normalizedData as never,
    });

    return NextResponse.json({ sector }, { status: 201 });
  } catch (error) {
    console.error("Create sector error:", error);
    return NextResponse.json(
      { error: "Failed to create sector" },
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
    const { key, ...updateData } = data;

    if (!key) {
      return NextResponse.json(
        { error: "Sector key is required" },
        { status: 400 }
      );
    }

    const sector = await prisma.referenceSector.update({
      where: { key: key.toUpperCase() },
      data: {
        name: updateData.name?.trim(),
        icon: updateData.icon?.trim(),
        color: updateData.color?.trim(),
        active: updateData.active,
        sortOrder: updateData.sortOrder,
      },
    });

    return NextResponse.json({ sector });
  } catch (error) {
    console.error("Update sector error:", error);
    return NextResponse.json(
      { error: "Failed to update sector" },
      { status: 500 }
    );
  }
}