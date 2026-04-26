import { type NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  buildProjectFilterWhere,
  parseProjectFilterParams,
} from "@/lib/project-filters";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");

    // Parse filter params (Country, Sector, Status, Organisation, Donor,
    // District/County, Active During Year, Budget Tier).
    const filterParams = parseProjectFilterParams(searchParams);
    const { where: filterWhere } = buildProjectFilterWhere(filterParams);

    // Access control + org scoping. Partner Admins are locked to their own
    // org regardless of query. System Owners may pass organizationId to scope
    // a view; otherwise they see everything.
    let orgScope: Prisma.ProjectWhereInput = {};
    if (session) {
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        include: { role: true },
      });

      if (user?.role?.role === "PARTNER_ADMIN" && user.role.organizationId) {
        orgScope = { organizationId: user.role.organizationId };
      } else if (organizationId) {
        orgScope = { organizationId };
      }
    } else {
      // Unauthenticated callers only ever see PUBLISHED projects.
      orgScope = { visibility: "PUBLISHED" };
    }

    // Compose: AND of filter params + org scope.
    const where: Prisma.ProjectWhereInput = {
      AND: [filterWhere, orgScope],
    };

    const [
      totalProjects,
      totalOrganizations,
      projectsByCountry,
      projectsBySector,
      projectsByStatus,
      aggregates,
      recentProjects,
    ] = await Promise.all([
      prisma.project.count({ where }),
      prisma.organization.count({ where: { active: true } }),
      prisma.project.groupBy({
        by: ["countryCode"],
        where,
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 10,
      }),
      prisma.project.groupBy({
        by: ["sectorKey"],
        where,
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
      }),
      prisma.project.groupBy({
        by: ["status"],
        where,
        _count: { id: true },
      }),
      prisma.project.aggregate({
        where,
        _sum: { budgetUsd: true, targetBeneficiaries: true },
      }),
      prisma.project.findMany({
        where,
        take: 5,
        orderBy: { createdAt: "desc" },
        include: {
          organization: { select: { name: true } },
        },
      }),
    ]);

    const [countries, sectors] = await Promise.all([
      prisma.referenceCountry.findMany({
        where: {
          code: { in: projectsByCountry.map((p) => p.countryCode) },
        },
      }),
      prisma.referenceSector.findMany(),
    ]);

    const countryMap = new Map(countries.map((c) => [c.code, c.name]));
    const sectorMap = new Map(sectors.map((s) => [s.key, s]));

    return NextResponse.json({
      summary: {
        totalProjects,
        totalOrganizations,
        totalBudget: aggregates._sum.budgetUsd || 0,
        totalBeneficiaries: aggregates._sum.targetBeneficiaries || 0,
        activeProjects:
          projectsByStatus.find((p) => p.status === "ACTIVE")?._count.id || 0,
        plannedProjects:
          projectsByStatus.find((p) => p.status === "PLANNED")?._count.id || 0,
        completedProjects:
          projectsByStatus.find((p) => p.status === "COMPLETED")?._count.id ||
          0,
      },
      projectsByCountry: projectsByCountry.map((p) => ({
        countryCode: p.countryCode,
        countryName: countryMap.get(p.countryCode) || p.countryCode,
        count: p._count.id,
      })),
      projectsBySector: projectsBySector.map((p) => {
        const sector = sectorMap.get(p.sectorKey);
        return {
          sectorKey: p.sectorKey,
          sectorName: sector?.name || p.sectorKey,
          color: sector?.color || "#888",
          count: p._count.id,
        };
      }),
      projectsByStatus: projectsByStatus.map((p) => ({
        status: p.status,
        count: p._count.id,
      })),
      recentProjects: recentProjects.map((p) => ({
        id: p.id,
        title: p.title,
        organizationName: p.organization.name,
        status: p.status,
        createdAt: p.createdAt,
      })),
    });
  } catch (error) {
    console.error("Get analytics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 },
    );
  }
}