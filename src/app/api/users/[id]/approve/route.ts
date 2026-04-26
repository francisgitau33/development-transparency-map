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
        { error: "Only system owners can approve users" },
        { status: 403 }
      );
    }

    const { id: userId } = await params;
    const { organizationId, role } = await request.json();

    if (!organizationId && role === "PARTNER_ADMIN") {
      return NextResponse.json(
        { error: "Organization is required for Partner Admin role" },
        { status: 400 }
      );
    }

    if (!["SYSTEM_OWNER", "PARTNER_ADMIN"].includes(role)) {
      return NextResponse.json(
        { error: "Invalid role. Must be SYSTEM_OWNER or PARTNER_ADMIN" },
        { status: 400 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { pendingRequest: true, role: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (targetUser.role) {
      return NextResponse.json(
        { error: "User already has a role assigned" },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.role.create({
        data: {
          userId,
          email: targetUser.email,
          role: role,
          organizationId: role === "PARTNER_ADMIN" ? organizationId : null,
        },
      });

      if (role === "PARTNER_ADMIN" && organizationId) {
        await tx.user.update({
          where: { id: userId },
          data: { organizationId },
        });
      }

      if (targetUser.pendingRequest) {
        await tx.pendingAccessRequest.update({
          where: { id: targetUser.pendingRequest.id },
          data: { status: "APPROVED" },
        });
      }

      await logAudit(
        {
          actorId: session.userId,
          actorEmail: currentUser?.email,
          action: AUDIT_ACTIONS.USER_APPROVED,
          entityType: "User",
          entityId: userId,
          payload: { role, organizationId: organizationId ?? null },
        },
        tx,
      );

      await logAudit(
        {
          actorId: session.userId,
          actorEmail: currentUser?.email,
          action: AUDIT_ACTIONS.ROLE_ASSIGNED,
          entityType: "Role",
          entityId: userId,
          payload: { role, organizationId: organizationId ?? null },
        },
        tx,
      );
    });

    return NextResponse.json({
      message: "User approved successfully",
      role,
      organizationId,
    });
  } catch (error) {
    console.error("Approve user error:", error);
    return NextResponse.json(
      { error: "Failed to approve user" },
      { status: 500 }
    );
  }
}