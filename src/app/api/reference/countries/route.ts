import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { validateCountry } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("activeOnly") === "true";

    const where: Record<string, unknown> = {};
    if (activeOnly) {
      where.active = true;
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
      where: { code: validation.normalizedData!.code as string },
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