import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { role: true },
    });

    if (currentUser?.role?.role !== "SYSTEM_OWNER") {
      return NextResponse.json(
        { error: "Only system owners can decline users" },
        { status: 403 }
      );
    }

    const { id: userId } = await params;
    const { notes } = await request.json();

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { pendingRequest: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!targetUser.pendingRequest) {
      return NextResponse.json(
        { error: "No pending request found for this user" },
        { status: 400 }
      );
    }

    await prisma.pendingAccessRequest.update({
      where: { id: targetUser.pendingRequest.id },
      data: {
        status: "DECLINED",
        notes: notes || null,
      },
    });

    await logAudit({
      actorId: session.userId,
      actorEmail: currentUser?.email,
      action: AUDIT_ACTIONS.USER_DECLINED,
      entityType: "User",
      entityId: userId,
      payload: { notes: notes ?? null },
    });

    return NextResponse.json({ message: "User request declined" });
  } catch (error) {
    console.error("Decline user error:", error);
    return NextResponse.json(
      { error: "Failed to decline user" },
      { status: 500 }
    );
  }
}