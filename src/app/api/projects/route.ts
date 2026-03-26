import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { validateProject } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const countryCode = searchParams.get("countryCode");
    const sectorKey = searchParams.get("sectorKey");
    const status = searchParams.get("status");
    const organizationId = searchParams.get("organizationId");
    const organizationType = searchParams.get("organizationType");
    const forMap = searchParams.get("forMap") === "true";

    const where: Record<string, unknown> = {};

    if (countryCode) where.countryCode = countryCode.toUpperCase();
    if (sectorKey) where.sectorKey = sectorKey.toUpperCase();
    if (status) where.status = status.toUpperCase();
    if (organizationId) where.organizationId = organizationId;
    if (organizationType) {
      where.organization = { type: organizationType.toUpperCase() };
    }

    if (forMap) {
      where.latitude = { not: null };
      where.longitude = { not: null };
    }

    const projects = await prisma.project.findMany({
      where,
      include: {
        organization: {
          select: { id: true, name: true, type: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Get projects error:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
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

    if (!user?.role) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const data = await request.json();

    if (user.role.role === "PARTNER_ADMIN") {
      if (!user.role.organizationId) {
        return NextResponse.json(
          { error: "You are not associated with an organization" },
          { status: 403 }
        );
      }
      data.organizationId = user.role.organizationId;
    }

    const country = await prisma.referenceCountry.findUnique({
      where: { code: data.countryCode?.toUpperCase() },
    });
    if (!country || !country.active) {
      return NextResponse.json(
        { error: "Invalid or inactive country code" },
        { status: 400 }
      );
    }

    const sector = await prisma.referenceSector.findUnique({
      where: { key: data.sectorKey?.toUpperCase() },
    });
    if (!sector || !sector.active) {
      return NextResponse.json(
        { error: "Invalid or inactive sector" },
        { status: 400 }
      );
    }

    const validation = validateProject(data);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.errors },
        { status: 400 }
      );
    }

    const project = await prisma.project.create({
      data: {
        ...validation.normalizedData,
        createdByUserId: session.userId,
        startDate: new Date(validation.normalizedData!.startDate as string),
        endDate: validation.normalizedData!.endDate
          ? new Date(validation.normalizedData!.endDate as string)
          : null,
      } as never,
      include: {
        organization: {
          select: { id: true, name: true, type: true },
        },
      },
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error("Create project error:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}