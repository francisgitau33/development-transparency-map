import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import { validateTeamMember } from "@/lib/validation";

/**
 * /api/team/[id]
 *
 *   PUT     — SYSTEM_OWNER only. Replaces the mutable fields of a
 *             single team member. Uses the same validator as POST so
 *             the normalization rules stay in one place.
 *   DELETE  — SYSTEM_OWNER only. Hard-deletes the row. TeamMember has
 *             no dependants so there is no guard to clear.
 *
 * Authentication is checked here and not in middleware because the
 * middleware only gates /dashboard/**; API routes carry their own
 * session + role checks (matching the existing CMS-About pattern).
 */

interface SerializableTeamMember {
  id: string;
  name: string;
  role: string;
  bio: string | null;
  photoUrl: string | null;
  linkedinUrl: string | null;
  displayOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function serializeTeamMember(m: SerializableTeamMember) {
  return {
    id: m.id,
    name: m.name,
    role: m.role,
    bio: m.bio,
    photoUrl: m.photoUrl,
    linkedinUrl: m.linkedinUrl,
    displayOrder: m.displayOrder,
    active: m.active,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { role: true },
    });

    if (user?.role?.role !== "SYSTEM_OWNER") {
      return NextResponse.json(
        { error: "Only system owners can edit team members" },
        { status: 403 },
      );
    }

    const existing = await prisma.teamMember.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Team member not found" },
        { status: 404 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const validation = validateTeamMember(body);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.errors },
        { status: 400 },
      );
    }

    const data = validation.normalizedData as {
      name: string;
      role: string;
      bio: string | null;
      photoUrl: string | null;
      linkedinUrl: string | null;
      displayOrder: number;
      active: boolean;
    };

    const member = await prisma.teamMember.update({
      where: { id },
      data: {
        name: data.name,
        role: data.role,
        bio: data.bio,
        photoUrl: data.photoUrl,
        linkedinUrl: data.linkedinUrl,
        displayOrder: data.displayOrder,
        active: data.active,
      },
    });

    await logAudit({
      actorId: session.userId,
      actorEmail: user.email,
      action: AUDIT_ACTIONS.TEAM_MEMBER_UPDATED,
      entityType: "TeamMember",
      entityId: member.id,
      payload: {
        name: member.name,
        role: member.role,
        active: member.active,
      },
    });

    return NextResponse.json({ member: serializeTeamMember(member) });
  } catch (error) {
    console.error("Update team member error:", error);
    return NextResponse.json(
      { error: "Failed to update team member" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { role: true },
    });

    if (user?.role?.role !== "SYSTEM_OWNER") {
      return NextResponse.json(
        { error: "Only system owners can delete team members" },
        { status: 403 },
      );
    }

    const existing = await prisma.teamMember.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Team member not found" },
        { status: 404 },
      );
    }

    await prisma.teamMember.delete({ where: { id } });

    await logAudit({
      actorId: session.userId,
      actorEmail: user.email,
      action: AUDIT_ACTIONS.TEAM_MEMBER_DELETED,
      entityType: "TeamMember",
      entityId: id,
      payload: {
        name: existing.name,
        role: existing.role,
      },
    });

    return NextResponse.json({
      success: true,
      deleted: { id, name: existing.name },
    });
  } catch (error) {
    console.error("Delete team member error:", error);
    return NextResponse.json(
      { error: "Failed to delete team member" },
      { status: 500 },
    );
  }
}