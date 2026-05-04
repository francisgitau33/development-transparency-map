import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import { validateTeamMember } from "@/lib/validation";

/**
 * /api/team
 *
 *   GET   — public. Lists team members for the "Our Team" public page.
 *           Anonymous callers see only `active: true` rows, ordered by
 *           (displayOrder asc, name asc). SYSTEM_OWNERs can pass
 *           `?all=true` to see every row (active + inactive) for the
 *           CMS editor — no other role ever receives inactive rows.
 *
 *   POST  — SYSTEM_OWNER only. Creates a new team member.
 *
 * Mutation endpoints for a single member live at /api/team/[id].
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const wantAll = searchParams.get("all") === "true";

    // Only SYSTEM_OWNERs can request inactive rows via ?all=true. Anyone
    // else (anon, PARTNER_ADMIN, invalid ?all) gets only active rows.
    let includeInactive = false;
    if (wantAll) {
      const session = await getSession();
      if (session) {
        const user = await prisma.user.findUnique({
          where: { id: session.userId },
          include: { role: true },
        });
        if (user?.role?.role === "SYSTEM_OWNER") {
          includeInactive = true;
        }
      }
    }

    const members = await prisma.teamMember.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({
      members: members.map(serializeTeamMember),
    });
  } catch (error) {
    console.error("List team members error:", error);
    return NextResponse.json(
      { error: "Failed to fetch team members" },
      { status: 500 },
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
        { error: "Only system owners can add team members" },
        { status: 403 },
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

    const member = await prisma.teamMember.create({
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
      action: AUDIT_ACTIONS.TEAM_MEMBER_CREATED,
      entityType: "TeamMember",
      entityId: member.id,
      payload: {
        name: member.name,
        role: member.role,
        active: member.active,
      },
    });

    return NextResponse.json(
      { member: serializeTeamMember(member) },
      { status: 201 },
    );
  } catch (error) {
    console.error("Create team member error:", error);
    return NextResponse.json(
      { error: "Failed to create team member" },
      { status: 500 },
    );
  }
}