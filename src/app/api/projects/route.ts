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
    const administrativeAreaId = searchParams.get("administrativeAreaId");
    const donorId = searchParams.get("donorId");
    const activeDuringYearParam = searchParams.get("activeDuringYear");
    // `budgetTier` accepts a single tier or a comma-separated list.
    const budgetTierParam = searchParams.get("budgetTier");

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
    if (administrativeAreaId) where.administrativeAreaId = administrativeAreaId;
    if (donorId) where.donorId = donorId;

    // Collect composable conditions into an AND list so later steps (the
    // visibility RBAC branch) can freely use `OR` without clobbering us.
    const andFilters: Record<string, unknown>[] = [];

    // activeDuringYear: a project is "active during" a year iff its date
    // range overlaps [Jan 1, Dec 31] of that year. A missing endDate is
    // treated as "still active".
    if (activeDuringYearParam) {
      const year = Number.parseInt(activeDuringYearParam, 10);
      if (!Number.isNaN(year) && year >= 1900 && year <= 2100) {
        const yearStart = new Date(Date.UTC(year, 0, 1));
        const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
        andFilters.push({ startDate: { lte: yearEnd } });
        andFilters.push({
          OR: [{ endDate: null }, { endDate: { gte: yearStart } }],
        });
      }
    }

    // budgetTier: Micro <50k, Small 50k-<500k, Medium 500k-<2M, Large >=2M.
    // Projects with null budgetUsd are excluded when a tier filter is set.
    if (budgetTierParam) {
      const tiers = budgetTierParam
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);
      const ranges: Array<{ gte?: number; lt?: number }> = [];
      for (const tier of tiers) {
        if (tier === "MICRO") ranges.push({ lt: 50_000 });
        else if (tier === "SMALL") ranges.push({ gte: 50_000, lt: 500_000 });
        else if (tier === "MEDIUM")
          ranges.push({ gte: 500_000, lt: 2_000_000 });
        else if (tier === "LARGE") ranges.push({ gte: 2_000_000 });
      }
      if (ranges.length === 1) {
        andFilters.push({ budgetUsd: ranges[0] });
      } else if (ranges.length > 1) {
        andFilters.push({
          OR: ranges.map((r) => ({ budgetUsd: r })),
        });
      }
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
      andFilters.push({
        OR: [
          { organizationId: viewerOrgId },
          { visibility: "PUBLISHED" },
        ],
      });
    } else if (
      viewerRole === "SYSTEM_OWNER" &&
      visibilityParam &&
      VALID_VISIBILITIES.has(visibilityParam.toUpperCase())
    ) {
      where.visibility = visibilityParam.toUpperCase();
    }

    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    const projects = await prisma.project.findMany({
      where,
      include: {
        organization: {
          select: { id: true, name: true, type: true },
        },
        administrativeArea: {
          select: { id: true, name: true, type: true, countryCode: true },
        },
        donor: {
          select: { id: true, name: true, donorType: true },
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

    // Reference-data sanity checks for Admin Area and Donor.
    if (data.administrativeAreaId) {
      const area = await prisma.administrativeArea.findUnique({
        where: { id: String(data.administrativeAreaId) },
      });
      if (!area) {
        return NextResponse.json(
          { error: "Selected district / county was not found" },
          { status: 400 },
        );
      }
      if (!area.active) {
        return NextResponse.json(
          { error: "Selected district / county is not active" },
          { status: 400 },
        );
      }
      if (
        data.countryCode &&
        area.countryCode !== String(data.countryCode).toUpperCase()
      ) {
        return NextResponse.json(
          {
            error:
              "Selected district / county does not belong to the selected country",
          },
          { status: 400 },
        );
      }
    }

    if (data.donorId) {
      const donor = await prisma.donor.findUnique({
        where: { id: String(data.donorId) },
      });
      if (!donor) {
        return NextResponse.json(
          { error: "Selected donor was not found" },
          { status: 400 },
        );
      }
      if (!donor.active) {
        return NextResponse.json(
          { error: "Selected donor is not active" },
          { status: 400 },
        );
      }
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
        administrativeArea: {
          select: { id: true, name: true, type: true, countryCode: true },
        },
        donor: {
          select: { id: true, name: true, donorType: true },
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