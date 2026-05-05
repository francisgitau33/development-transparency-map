import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import { BRANDING } from "@/lib/branding";
import { validateCmsHomeContent } from "@/lib/validation";

/**
 * /api/cms/home
 *
 *   GET — public, unauthenticated. Returns the CMS-managed homepage
 *         content. If no row exists yet the response falls back to the
 *         hardcoded BRANDING constants so the public homepage never
 *         breaks because the CMS is empty.
 *
 *   PUT — SYSTEM_OWNER only. Upserts the single CMS home-page row
 *         (creates one if none exists, otherwise updates the first row
 *         in place). PARTNER_ADMIN and anonymous callers receive 401 /
 *         403 respectively. Writes an audit event.
 */

function fallbackContent() {
  return {
    heroTitle: BRANDING.tagline,
    heroSubtitle: BRANDING.subtitle,
    heroDescription: BRANDING.description,
    primaryCtaLabel: "Explore the Map",
    primaryCtaHref: "/map",
    secondaryCtaLabel: null as string | null,
    secondaryCtaHref: null as string | null,
    updatedAt: null as string | null,
  };
}

export async function GET() {
  try {
    const row = await prisma.cmsHome.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    if (!row) {
      return NextResponse.json({ content: fallbackContent() });
    }

    return NextResponse.json({
      content: {
        heroTitle: row.heroTitle,
        heroSubtitle: row.heroSubtitle,
        heroDescription: row.heroDescription,
        primaryCtaLabel: row.primaryCtaLabel,
        primaryCtaHref: row.primaryCtaHref,
        secondaryCtaLabel: row.secondaryCtaLabel,
        secondaryCtaHref: row.secondaryCtaHref,
        updatedAt: row.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Get CMS home content error:", error);
    // Fallback to branding defaults so the public page still renders
    // even if Postgres is momentarily unreachable.
    return NextResponse.json({ content: fallbackContent() });
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
        { error: "Only system owners can edit CMS content" },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const validation = validateCmsHomeContent(body);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.errors },
        { status: 400 },
      );
    }

    const data = validation.normalizedData as {
      heroTitle: string;
      heroSubtitle: string;
      heroDescription: string | null;
      primaryCtaLabel: string | null;
      primaryCtaHref: string | null;
      secondaryCtaLabel: string | null;
      secondaryCtaHref: string | null;
    };

    const existing = await prisma.cmsHome.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    const row = existing
      ? await prisma.cmsHome.update({
          where: { id: existing.id },
          data: {
            heroTitle: data.heroTitle,
            heroSubtitle: data.heroSubtitle,
            heroDescription: data.heroDescription,
            primaryCtaLabel: data.primaryCtaLabel,
            primaryCtaHref: data.primaryCtaHref,
            secondaryCtaLabel: data.secondaryCtaLabel,
            secondaryCtaHref: data.secondaryCtaHref,
            updatedByUserId: session.userId,
          },
        })
      : await prisma.cmsHome.create({
          data: {
            heroTitle: data.heroTitle,
            heroSubtitle: data.heroSubtitle,
            heroDescription: data.heroDescription,
            primaryCtaLabel: data.primaryCtaLabel,
            primaryCtaHref: data.primaryCtaHref,
            secondaryCtaLabel: data.secondaryCtaLabel,
            secondaryCtaHref: data.secondaryCtaHref,
            updatedByUserId: session.userId,
          },
        });

    await logAudit({
      actorId: session.userId,
      actorEmail: user.email,
      action: AUDIT_ACTIONS.CMS_HOME_UPDATED,
      entityType: "CmsHome",
      entityId: row.id,
      payload: {
        heroTitleLength: data.heroTitle.length,
        hasDescription: Boolean(data.heroDescription),
        hasPrimaryCta: Boolean(data.primaryCtaHref),
        hasSecondaryCta: Boolean(data.secondaryCtaHref),
      },
    });

    return NextResponse.json({
      content: {
        heroTitle: row.heroTitle,
        heroSubtitle: row.heroSubtitle,
        heroDescription: row.heroDescription,
        primaryCtaLabel: row.primaryCtaLabel,
        primaryCtaHref: row.primaryCtaHref,
        secondaryCtaLabel: row.secondaryCtaLabel,
        secondaryCtaHref: row.secondaryCtaHref,
        updatedAt: row.updatedAt.toISOString(),
      },
      message: "Home page content updated",
    });
  } catch (error) {
    console.error("Update CMS home content error:", error);
    return NextResponse.json(
      { error: "Failed to update home page content" },
      { status: 500 },
    );
  }
}