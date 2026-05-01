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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const organization = await prisma.organization.findUnique({
      where: { id },
      include: {
        operatingCountries: { select: { countryCode: true } },
        _count: {
          select: { projects: true, users: true },
        },
      },
    });

    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    return NextResponse.json({
      organization: serializeOrganization(organization),
    });
  } catch (error) {
    console.error("Get organization error:", error);
    return NextResponse.json(
      { error: "Failed to fetch organization" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    // Only SYSTEM_OWNER can edit organizations
    if (user?.role?.role !== "SYSTEM_OWNER") {
      return NextResponse.json(
        { error: "Only system owners can edit organizations" },
        { status: 403 }
      );
    }

    const existingOrg = await prisma.organization.findUnique({
      where: { id },
    });

    if (!existingOrg) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
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
      await tx.organization.update({
        where: { id },
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
        id,
        normalized.countryScope,
        normalized.countryIds,
      );

      return tx.organization.findUniqueOrThrow({
        where: { id },
        include: {
          operatingCountries: { select: { countryCode: true } },
          _count: { select: { projects: true, users: true } },
        },
      });
    });

    await logAudit({
      actorId: session.userId,
      actorEmail: user.email,
      action: AUDIT_ACTIONS.ORGANIZATION_UPDATED,
      entityType: "Organization",
      entityId: organization.id,
      payload: {
        name: organization.name,
        type: organization.type,
        countryScope: normalized.countryScope,
        countryIds: normalized.countryIds,
        active: organization.active,
      },
    });

    return NextResponse.json({
      organization: serializeOrganization(organization),
    });
  } catch (error) {
    console.error("Update organization error:", error);
    return NextResponse.json(
      { error: "Failed to update organization" },
      { status: 500 }
    );
  }
}