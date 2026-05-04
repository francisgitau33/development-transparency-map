import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import {
  validateTeamMember,
  validateTeamMemberPhoto,
} from "@/lib/validation";

/**
 * /api/team
 *
 *   GET   — public. Lists team members for the "Our Team" public page.
 *           Anonymous callers see only `active: true` rows, ordered by
 *           (displayOrder asc, name asc). SYSTEM_OWNERs can pass
 *           `?all=true` to see every row (active + inactive) for the
 *           CMS editor — no other role ever receives inactive rows.
 *           The response includes `hasPhoto: boolean` so callers can
 *           pick between the uploaded-photo endpoint
 *           (/api/team/[id]/photo) and any legacy external URL on
 *           `photoUrl`. Raw bytes are NEVER returned here.
 *
 *   POST  — SYSTEM_OWNER only. Creates a new team member. Requires an
 *           uploaded photo (JPEG / PNG) in `photoBase64` +
 *           `photoMimeType`. Validation runs server-side (MIME + magic
 *           bytes + size cap).
 *
 * Mutation endpoints for a single member live at /api/team/[id].
 */

interface SerializableTeamMember {
  id: string;
  name: string;
  role: string;
  bio: string | null;
  photoUrl: string | null;
  photoMimeType: string | null;
  linkedinUrl: string | null;
  displayOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function serializeTeamMember(
  m: SerializableTeamMember & { photoData?: Buffer | Uint8Array | null },
) {
  // `photoData` is a heavy binary column that must NEVER be returned
  // in the JSON list / item response. It is only served through the
  // dedicated photo route. Destructure it off explicitly.
  return {
    id: m.id,
    name: m.name,
    role: m.role,
    bio: m.bio,
    photoUrl: m.photoUrl,
    hasPhoto: Boolean(m.photoData) && Boolean(m.photoMimeType),
    photoMimeType: m.photoMimeType,
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

    // Select a narrow set of fields that excludes the heavy photoData
    // column — the client only needs to know whether a photo exists.
    const members = await prisma.teamMember.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        role: true,
        bio: true,
        photoUrl: true,
        photoMimeType: true,
        linkedinUrl: true,
        displayOrder: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        // Include only the boolean presence of photoData via a computed
        // projection below. Prisma doesn't support COALESCE-as-bool in
        // `select`, so we read a single byte via `_count`? — cleaner:
        // fetch nothing and let the route issue a tiny follow-up check.
        // Simpler and cheap enough: read photoData and convert to a
        // boolean in-memory, since the payloads are capped at 2 MB and
        // this endpoint is paginated by the natural team size (~small).
        photoData: true,
      },
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

    // Photo is REQUIRED on create — the CMS brief explicitly says new
    // records must include an uploaded JPEG / PNG.
    const photo = validateTeamMemberPhoto(
      (body as { photoBase64?: unknown }).photoBase64,
      (body as { photoMimeType?: unknown }).photoMimeType,
    );
    if (!photo.valid || !photo.data || !photo.mimeType) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: [photo.error ?? "Photo is required"],
        },
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
        // Legacy external-URL field is NOT accepted from the CMS form
        // anymore — the CMS always uploads bytes. We still persist the
        // normalised value if the validator produced one, so direct
        // API callers can still pass a URL if they want to.
        photoUrl: data.photoUrl,
        photoData: photo.data,
        photoMimeType: photo.mimeType,
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
        photoBytes: photo.data.length,
        photoMimeType: photo.mimeType,
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