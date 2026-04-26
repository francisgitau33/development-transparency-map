/**
 * Shared project-filter helpers.
 *
 * Used by:
 * - GET /api/projects           (list + public map)
 * - GET /api/analytics          (reports & analytics dashboards)
 *
 * All helpers accept URLSearchParams (or a plain object) and return a
 * Prisma `where` clause that can be merged with access-control scoping.
 */

import type { Prisma } from "@prisma/client";

export interface ProjectFilterParams {
  countryCode?: string | null;
  sectorKey?: string | null;
  status?: string | null;
  organizationId?: string | null;
  organizationType?: string | null;
  administrativeAreaId?: string | null;
  donorId?: string | null;
  activeDuringYear?: string | number | null;
  /** Comma-separated list, e.g. "MICRO,SMALL" */
  budgetTier?: string | null;
}

export interface BuiltFilter {
  where: Prisma.ProjectWhereInput;
}

export function parseProjectFilterParams(
  searchParams: URLSearchParams,
): ProjectFilterParams {
  return {
    countryCode: searchParams.get("countryCode"),
    sectorKey: searchParams.get("sectorKey"),
    status: searchParams.get("status"),
    organizationId: searchParams.get("organizationId"),
    organizationType: searchParams.get("organizationType"),
    administrativeAreaId: searchParams.get("administrativeAreaId"),
    donorId: searchParams.get("donorId"),
    activeDuringYear: searchParams.get("activeDuringYear"),
    budgetTier: searchParams.get("budgetTier"),
  };
}

const BUDGET_RANGES: Record<
  string,
  { gte?: number; lt?: number }
> = {
  MICRO: { lt: 50_000 },
  SMALL: { gte: 50_000, lt: 500_000 },
  MEDIUM: { gte: 500_000, lt: 2_000_000 },
  LARGE: { gte: 2_000_000 },
};

export function buildProjectFilterWhere(
  params: ProjectFilterParams,
): BuiltFilter {
  const where: Prisma.ProjectWhereInput = {};
  const andFilters: Prisma.ProjectWhereInput[] = [];

  if (params.countryCode) where.countryCode = params.countryCode.toUpperCase();
  if (params.sectorKey) where.sectorKey = params.sectorKey.toUpperCase();
  if (params.status) {
    where.status = params.status.toUpperCase() as Prisma.ProjectWhereInput["status"];
  }
  if (params.organizationId) where.organizationId = params.organizationId;
  if (params.organizationType) {
    where.organization = {
      type: params.organizationType.toUpperCase() as never,
    };
  }
  if (params.administrativeAreaId) {
    where.administrativeAreaId = params.administrativeAreaId;
  }
  if (params.donorId) where.donorId = params.donorId;

  if (params.activeDuringYear !== null && params.activeDuringYear !== undefined) {
    const year = Number.parseInt(String(params.activeDuringYear), 10);
    if (!Number.isNaN(year) && year >= 1900 && year <= 2100) {
      const yearStart = new Date(Date.UTC(year, 0, 1));
      const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
      andFilters.push({ startDate: { lte: yearEnd } });
      andFilters.push({
        OR: [{ endDate: null }, { endDate: { gte: yearStart } }],
      });
    }
  }

  if (params.budgetTier) {
    const tiers = params.budgetTier
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t in BUDGET_RANGES);
    const ranges = tiers.map((t) => BUDGET_RANGES[t]);
    if (ranges.length === 1) {
      andFilters.push({ budgetUsd: ranges[0] });
    } else if (ranges.length > 1) {
      andFilters.push({ OR: ranges.map((r) => ({ budgetUsd: r })) });
    }
  }

  if (andFilters.length > 0) {
    where.AND = andFilters;
  }

  return { where };
}