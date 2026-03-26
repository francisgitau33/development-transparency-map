import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET() {
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
        { error: "Only system owners can view pending requests" },
        { status: 403 }
      );
    }

    const pendingRequests = await prisma.pendingAccessRequest.findMany({
      where: { status: "PENDING" },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, createdAt: true },
        },
      },
      orderBy: { requestedAt: "desc" },
    });

    return NextResponse.json({ pendingRequests });
  } catch (error) {
    console.error("Get pending requests error:", error);
    return NextResponse.json(
      { error: "Failed to fetch pending requests" },
      { status: 500 }
    );
  }
}