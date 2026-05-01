import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { validateOrganization } from "@/lib/validation";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import {
  filterActiveCountryCodes,
  readOrganizationCountries,
  syncOrganizationCountries,
} from "@/lib/organization-countries";

/**
 * Shape returned by both GET and POST — the multi-country state is
 * promoted to first-class fields (`countryScope`, `countryIds`) and the
 * legacy `countryCode` scalar is preserved for back-compat.
 */
function serializeOrganization(
  org: Awaited<ReturnType<typeof prisma.organization.findFirstOrThrow>> & {
    operatingCountries?: { countryCode: string }[];
    _count?: { projects: number; users: number };
  },
) {
  const { countryScope, countryIds } = readOrganizationCountries(org);
  return {
    id: org.id,
    name: org.name,
    type: org.type,
    countryScope,
    countryIds,
    // Legacy scalar kept for older clients. Equal to the first selected
    // country for SELECTED orgs, null for ALL-scope orgs.
    countryCode: org.countryCode,
    website: org.website,
    contactEmail: org.contactEmail,
    description: org.description,
    active: org.active,
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
    _count: org._count,
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("activeOnly") === "true";
    const countryFilter = searchParams.get("country")?.trim().toUpperCase();

    const where: Record<string, unknown> = {};
    if (activeOnly) {
      where.active = true;
    }

    if (session) {
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        include: { role: true },
      });

      if (user?.role?.role === "PARTNER_ADMIN" && user.role.organizationId) {
        where.id = user.role.organizationId;
      }
    }

    // Public "organizations operating in country X" filter:
    //   - organizations whose scope is ALL, OR
    //   - organizations whose OrganizationCountry[] contains the code.
    // Project-level markers are NOT affected by this filter — projects
    // are always filtered by their own `countryCode`.
    if (countryFilter) {
      where.OR = [
        { countryScope: "ALL" },
        { operatingCountries: { some: { countryCode: countryFilter } } },
      ];
    }

    const organizations = await prisma.organization.findMany({
      where,
      include: {
        operatingCountries: { select: { countryCode: true } },
        _count: {
          select: { projects: true, users: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      organizations: organizations.map(serializeOrganization),
    });
  } catch (error) {
    console.error("Get organizations error:", error);
    return NextResponse.json(
      { error: "Failed to fetch organizations" },
      { status: 500 }
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
        { error: "Only system owners can create organizations" },
        { status: 403 }
      );
    }

    const data = await request.json();

    const validation = validateOrganization(data);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.errors },
        { status: 400 }
      );
    }

    const normalized = validation.normalizedData as {
      name: string;
      type: string;
      countryScope: "ALL" | "SELECTED";
      countryIds: string[];
      countryCode: string | null;
      website: string | null;
      contactEmail: string | null;
      description: string | null;
      active: boolean;
    };

    // Cross-check every countryId against the ACTIVE, non-soft-deleted
    // reference table. Deleted or inactive countries may never be newly
    // selected — that matches the policy already enforced for Project
    // uploads (see src/app/api/upload/route.ts).
    if (normalized.countryScope === "SELECTED") {
      const { accepted, rejected } = await filterActiveCountryCodes(
        normalized.countryIds,
      );
      if (rejected.length > 0) {
        return NextResponse.json(
          {
            error: "One or more selected countries are invalid or inactive.",
            details: rejected.map(
              (code) => `Country '${code}' is not active or does not exist.`,
            ),
          },
          { status: 400 },
        );
      }
      normalized.countryIds = accepted;
      normalized.countryCode = accepted[0] ?? null;
    }

    const organization = await prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          name: normalized.name,
          type: normalized.type as never,
          countryScope: normalized.countryScope,
          countryCode: normalized.countryCode,
          website: normalized.website,
          contactEmail: normalized.contactEmail,
          description: normalized.description,
          active: normalized.active,
        },
      });

      await syncOrganizationCountries(
        tx,
        created.id,
        normalized.countryScope,
        normalized.countryIds,
      );

      return tx.organization.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          operatingCountries: { select: { countryCode: true } },
          _count: { select: { projects: true, users: true } },
        },
      });
    });

    await logAudit({
      actorId: session.userId,
      actorEmail: user.email,
      action: AUDIT_ACTIONS.ORGANIZATION_CREATED,
      entityType: "Organization",
      entityId: organization.id,
      payload: {
        name: organization.name,
        type: organization.type,
        countryScope: normalized.countryScope,
        countryIds: normalized.countryIds,
      },
    });

    return NextResponse.json(
      { organization: serializeOrganization(organization) },
      { status: 201 },
    );
  } catch (error) {
    console.error("Create organization error:", error);
    return NextResponse.json(
      { error: "Failed to create organization" },
      { status: 500 }
    );
  }
}