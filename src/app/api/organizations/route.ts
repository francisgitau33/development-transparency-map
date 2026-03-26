import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { validateOrganization } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("activeOnly") === "true";

    const where: Record<string, unknown> = {};
    if (activeOnly) {
      where.active = true;
    }

    if (session) {
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        include: { role: true },
      });

      if (user?.role?.role === "PARTNER_ADMIN" && user.role.organizationId) {
        where.id = user.role.organizationId;
      }
    }

    const organizations = await prisma.organization.findMany({
      where,
      include: {
        _count: {
          select: { projects: true, users: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ organizations });
  } catch (error) {
    console.error("Get organizations error:", error);
    return NextResponse.json(
      { error: "Failed to fetch organizations" },
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
        { error: "Only system owners can create organizations" },
        { status: 403 }
      );
    }

    const data = await request.json();

    const validation = validateOrganization(data);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.errors },
        { status: 400 }
      );
    }

    const organization = await prisma.organization.create({
      data: validation.normalizedData as never,
      include: {
        _count: {
          select: { projects: true, users: true },
        },
      },
    });

    return NextResponse.json({ organization }, { status: 201 });
  } catch (error) {
    console.error("Create organization error:", error);
    return NextResponse.json(
      { error: "Failed to create organization" },
      { status: 500 }
    );
  }
}