import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import { validateCmsPublicLinks } from "@/lib/validation";

/**
 * /api/cms/public-links
 *
 *   GET — public, unauthenticated. Returns the configured social /
 *         contact links. All fields may be null; the public UI hides
 *         the corresponding icon / line when null.
 *
 *   PUT — SYSTEM_OWNER only. Upserts the single public-links row.
 *         Blank strings are normalised to null. All URLs must be
 *         absolute https:// and the email must match a permissive
 *         RFC-shape pattern (see validateCmsPublicLinks).
 */

function emptyLinks() {
  return {
    linkedinUrl: null as string | null,
    mediumUrl: null as string | null,
    contactEmail: null as string | null,
    updatedAt: null as string | null,
  };
}

export async function GET() {
  try {
    const row = await prisma.cmsPublicLinks.findFirst({
      orderBy: { updatedAt: "desc" },
    });
    if (!row) {
      return NextResponse.json({ links: emptyLinks() });
    }
    return NextResponse.json({
      links: {
        linkedinUrl: row.linkedinUrl,
        mediumUrl: row.mediumUrl,
        contactEmail: row.contactEmail,
        updatedAt: row.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Get CMS public links error:", error);
    // Degrade gracefully — empty links hide everything, which is the
    // safest visible default if the DB is momentarily unreachable.
    return NextResponse.json({ links: emptyLinks() });
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
        { error: "Only system owners can edit public links" },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const validation = validateCmsPublicLinks(body);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.errors },
        { status: 400 },
      );
    }

    const data = validation.normalizedData as {
      linkedinUrl: string | null;
      mediumUrl: string | null;
      contactEmail: string | null;
    };

    const existing = await prisma.cmsPublicLinks.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    const row = existing
      ? await prisma.cmsPublicLinks.update({
          where: { id: existing.id },
          data: {
            linkedinUrl: data.linkedinUrl,
            mediumUrl: data.mediumUrl,
            contactEmail: data.contactEmail,
            updatedByUserId: session.userId,
          },
        })
      : await prisma.cmsPublicLinks.create({
          data: {
            linkedinUrl: data.linkedinUrl,
            mediumUrl: data.mediumUrl,
            contactEmail: data.contactEmail,
            updatedByUserId: session.userId,
          },
        });

    await logAudit({
      actorId: session.userId,
      actorEmail: user.email,
      action: AUDIT_ACTIONS.CMS_PUBLIC_LINKS_UPDATED,
      entityType: "CmsPublicLinks",
      entityId: row.id,
      payload: {
        hasLinkedin: Boolean(data.linkedinUrl),
        hasMedium: Boolean(data.mediumUrl),
        hasContactEmail: Boolean(data.contactEmail),
      },
    });

    return NextResponse.json({
      links: {
        linkedinUrl: row.linkedinUrl,
        mediumUrl: row.mediumUrl,
        contactEmail: row.contactEmail,
        updatedAt: row.updatedAt.toISOString(),
      },
      message: "Public links updated",
    });
  } catch (error) {
    console.error("Update CMS public links error:", error);
    return NextResponse.json(
      { error: "Failed to update public links" },
      { status: 500 },
    );
  }
}