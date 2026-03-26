import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET(request: NextRequest) {
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
        { error: "Only system owners can view all users" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const includePending = searchParams.get("includePending") === "true";

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        displayName: true,
        organizationId: true,
        createdAt: true,
        role: true,
        organization: {
          select: { id: true, name: true },
        },
        pendingRequest: includePending ? true : undefined,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Get users error:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}