import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { validateProject } from "@/lib/validation";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";

const VALID_VISIBILITIES = new Set([
  "DRAFT",
  "PENDING_REVIEW",
  "PUBLISHED",
  "UNPUBLISHED",
]);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const countryCode = searchParams.get("countryCode");
    const sectorKey = searchParams.get("sectorKey");
    const status = searchParams.get("status");
    const organizationId = searchParams.get("organizationId");
    const organizationType = searchParams.get("organizationType");
    const visibilityParam = searchParams.get("visibility");
    const forMap = searchParams.get("forMap") === "true";

    // Distinguish public callers from authenticated dashboard callers.
    const session = await getSession();
    let viewerRole: "SYSTEM_OWNER" | "PARTNER_ADMIN" | null = null;
    let viewerOrgId: string | null = null;
    if (session) {
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        include: { role: true },
      });
      viewerRole = user?.role?.role ?? null;
      viewerOrgId = user?.role?.organizationId ?? null;
    }

    const where: Record<string, unknown> = {};

    if (countryCode) where.countryCode = countryCode.toUpperCase();
    if (sectorKey) where.sectorKey = sectorKey.toUpperCase();
    if (status) where.status = status.toUpperCase();
    if (organizationId) where.organizationId = organizationId;
    if (organizationType) {
      where.organization = { type: organizationType.toUpperCase() };
    }

    // Visibility rules
    // -----------------
    // - Public map / unauthenticated requests: only PUBLISHED.
    // - PARTNER_ADMIN: own org's projects of any visibility + other orgs'
    //   PUBLISHED projects (keeps the dashboard consistent with the public
    //   map without leaking drafts from peer organisations).
    // - SYSTEM_OWNER: all visibilities; may filter via ?visibility=.
    if (!viewerRole || forMap) {
      where.visibility = "PUBLISHED";
    } else if (viewerRole === "PARTNER_ADMIN") {
      where.OR = [
        { organizationId: viewerOrgId },
        { visibility: "PUBLISHED" },
      ];
    } else if (
      viewerRole === "SYSTEM_OWNER" &&
      visibilityParam &&
      VALID_VISIBILITIES.has(visibilityParam.toUpperCase())
    ) {
      where.visibility = visibilityParam.toUpperCase();
    }

    const projects = await prisma.project.findMany({
      where,
      include: {
        organization: {
          select: { id: true, name: true, type: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Get projects error:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
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

    if (!user?.role) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const data = await request.json();

    if (user.role.role === "PARTNER_ADMIN") {
      if (!user.role.organizationId) {
        return NextResponse.json(
          { error: "You are not associated with an organization" },
          { status: 403 },
        );
      }
      data.organizationId = user.role.organizationId;
    }

    const country = await prisma.referenceCountry.findUnique({
      where: { code: data.countryCode?.toUpperCase() },
    });
    if (!country || !country.active) {
      return NextResponse.json(
        { error: "Invalid or inactive country code" },
        { status: 400 },
      );
    }

    const sector = await prisma.referenceSector.findUnique({
      where: { key: data.sectorKey?.toUpperCase() },
    });
    if (!sector || !sector.active) {
      return NextResponse.json(
        { error: "Invalid or inactive sector" },
        { status: 400 },
      );
    }

    const validation = validateProject(data);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.errors },
        { status: 400 },
      );
    }

    // Visibility rules on create:
    // - Partner Admin: always PENDING_REVIEW, regardless of input.
    // - System Owner: may pass a visibility value; default PUBLISHED when
    //   omitted so pre-curated records can go live immediately.
    let visibility = "PENDING_REVIEW";
    if (user.role.role === "SYSTEM_OWNER") {
      const requested =
        typeof data.visibility === "string" ? data.visibility.toUpperCase() : null;
      visibility =
        requested && VALID_VISIBILITIES.has(requested)
          ? requested
          : "PUBLISHED";
    }

    const project = await prisma.project.create({
      data: {
        ...validation.normalizedData,
        visibility,
        createdByUserId: session.userId,
        startDate: new Date(validation.normalizedData?.startDate as string),
        endDate: validation.normalizedData?.endDate
          ? new Date(validation.normalizedData?.endDate as string)
          : null,
      } as never,
      include: {
        organization: {
          select: { id: true, name: true, type: true },
        },
      },
    });

    await logAudit({
      actorId: session.userId,
      actorEmail: user.email,
      action: AUDIT_ACTIONS.PROJECT_CREATED,
      entityType: "Project",
      entityId: project.id,
      payload: {
        title: project.title,
        organizationId: project.organizationId,
        countryCode: project.countryCode,
        sectorKey: project.sectorKey,
        status: project.status,
        visibility: project.visibility,
      },
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error("Create project error:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 },
    );
  }
}