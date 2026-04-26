/**
 * GET /api/reports/funding-cliffs
 *
 * Funding Cliff / Temporal Vulnerability analytics.
 *
 * Supplies the "Risk & Vulnerability" section of the
 * "Reports & Development Intelligence" page.
 *
 * A funding cliff is where a district / sector / donor combination is
 * expected to lose a significant share of currently active recorded budget
 * within a defined future period, without sufficient recorded planned
 * replacement funding.
 *
 * Access control:
 *   - Unauthenticated callers → 401.
 *   - PARTNER_ADMIN → always scoped to their own organisation.
 *   - SYSTEM_OWNER → may pass ?organizationId= to scope; otherwise platform-wide.
 *
 * Filters (all optional, parsed via the shared helper):
 *   countryCode, administrativeAreaId, sectorKey, status, organizationId,
 *   donorId, activeDuringYear, budgetTier.
 *
 * Funding-cliff-specific filter:
 *   fundingCliffWindow  Months: 6 | 12 | 18 | 24 (default 12).
 *
 * Core formulas (applied per grouping dimension):
 *   activeBudget              = Σ budgetUsd of active projects in grouping
 *   expiringBudget            = Σ budgetUsd of active projects in grouping
 *                               with endDate ∈ [today, today + window]
 *   plannedReplacementBudget  = Σ budgetUsd of PLANNED projects in grouping
 *                               with startDate ≤ today + window
 *   netExposure               = max(expiringBudget - plannedReplacementBudget, 0)
 *   cliffRiskPercent          = activeBudget > 0
 *                               ? (netExposure / activeBudget) × 100
 *                               : null
 *   riskLevel ∈ { Low, Moderate, High, Severe, Insufficient data }
 *
 * Only projects with numeric budget (> 0) and parsable dates contribute to
 * these calculations. Records excluded for these reasons are surfaced via
 * the `dataQuality` block so the frontend can render a neutral caveat.
 *
 * Design rules:
 *   - Never divide by zero.
 *   - Completed projects never count as current active funding or planned
 *     replacement funding.
 *   - Use neutral, development-sector language throughout.
 *   - Do not claim a donor has withdrawn — we only see recorded end dates.
 */

import { type NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  buildProjectFilterWhere,
  parseProjectFilterParams,
} from "@/lib/project-filters";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const MATRIX_TOP_N = 10;
const TOP_ALERT_LIMIT = 20;
const PROJECTS_ENDING_SOON_LIMIT = 50;
const UNKNOWN_DONOR = "Unknown / Not Provided";
const UNKNOWN_DISTRICT = "Unknown / Not Provided";

const SUPPORTED_WINDOWS = new Set([6, 12, 18, 24]);
const DEFAULT_WINDOW = 12;

// 4 six-month buckets covering 0 → 24 months ahead.
const TIMELINE_BUCKETS = [
  { key: "0-6", label: "0 – 6 months", startMonth: 0, endMonth: 6 },
  { key: "6-12", label: "6 – 12 months", startMonth: 6, endMonth: 12 },
  { key: "12-18", label: "12 – 18 months", startMonth: 12, endMonth: 18 },
  { key: "18-24", label: "18 – 24 months", startMonth: 18, endMonth: 24 },
] as const;

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface ProjectForCliff {
  id: string;
  title: string;
  countryCode: string;
  sectorKey: string;
  status: string;
  budgetUsd: number | null;
  targetBeneficiaries: number | null;
  startDate: Date | null;
  endDate: Date | null;
  administrativeAreaId: string | null;
  donorId: string | null;
  organizationId: string;
  organization: { id: string; name: string };
  administrativeArea: { id: string; name: string; type: string | null } | null;
  donor: { id: string; name: string } | null;
}

type RiskLevel = "Low" | "Moderate" | "High" | "Severe" | "Insufficient data";

interface CliffRow {
  key: string;
  name: string;
  /** Optional additional label, e.g. district type */
  subLabel?: string | null;
  activeBudget: number;
  expiringBudget: number;
  plannedReplacementBudget: number;
  netExposure: number;
  cliffRiskPercent: number | null;
  riskLevel: RiskLevel;
  activeProjectCount: number;
  expiringProjectCount: number;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function parseWindowMonths(raw: string | null): number {
  if (!raw) return DEFAULT_WINDOW;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_WINDOW;
  return SUPPORTED_WINDOWS.has(n) ? n : DEFAULT_WINDOW;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/**
 * Classify a cliff percentage into a risk band.
 *
 * Deliberately conservative: where the percentage is null (typically
 * because activeBudget is zero or unavailable), we return
 * "Insufficient data" rather than defaulting to Low. This stops the UI
 * from implying a confident "safe" answer when we have no basis for one.
 */
function classify(cliffRiskPercent: number | null): RiskLevel {
  if (cliffRiskPercent === null || !Number.isFinite(cliffRiskPercent)) {
    return "Insufficient data";
  }
  if (cliffRiskPercent <= 25) return "Low";
  if (cliffRiskPercent <= 50) return "Moderate";
  if (cliffRiskPercent <= 75) return "High";
  return "Severe";
}

/**
 * An "active" project, for cliff purposes, is one that is currently running:
 *
 *   status === ACTIVE
 *   OR
 *   (startDate ≤ today AND endDate ≥ today)
 *
 * Completed projects are always excluded. Prefer the explicit status when
 * it is set to a terminal value (COMPLETED) over the date window.
 */
function isActive(p: ProjectForCliff, today: Date): boolean {
  if (p.status === "COMPLETED") return false;
  if (p.status === "ACTIVE") return true;
  if (p.startDate && p.endDate) {
    return p.startDate.getTime() <= today.getTime() &&
      p.endDate.getTime() >= today.getTime();
  }
  return false;
}

function hasUsableDates(p: ProjectForCliff): boolean {
  if (!p.startDate || !p.endDate) return false;
  return p.endDate.getTime() >= p.startDate.getTime();
}

function hasUsableBudget(p: ProjectForCliff): boolean {
  return p.budgetUsd !== null && Number.isFinite(p.budgetUsd) && p.budgetUsd > 0;
}

function buildCliffRow(params: {
  key: string;
  name: string;
  subLabel?: string | null;
  activeBudget: number;
  expiringBudget: number;
  plannedReplacementBudget: number;
  activeProjectCount: number;
  expiringProjectCount: number;
}): CliffRow {
  const netExposure = Math.max(
    params.expiringBudget - params.plannedReplacementBudget,
    0,
  );
  const cliffRiskPercent =
    params.activeBudget > 0 ? (netExposure / params.activeBudget) * 100 : null;
  return {
    key: params.key,
    name: params.name,
    subLabel: params.subLabel ?? null,
    activeBudget: params.activeBudget,
    expiringBudget: params.expiringBudget,
    plannedReplacementBudget: params.plannedReplacementBudget,
    netExposure,
    cliffRiskPercent,
    riskLevel: classify(cliffRiskPercent),
    activeProjectCount: params.activeProjectCount,
    expiringProjectCount: params.expiringProjectCount,
  };
}

// -----------------------------------------------------------------------------
// Route handler
// -----------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { role: true },
    });
    if (!user || !user.role) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filterParams = parseProjectFilterParams(searchParams);
    const { where: filterWhere } = buildProjectFilterWhere(filterParams);

    // Window: 6 / 12 / 18 / 24, default 12.
    const windowMonths = parseWindowMonths(
      searchParams.get("fundingCliffWindow"),
    );

    // Server-side "today" — trimmed to UTC midnight so two calls within the
    // same day return stable results.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const windowEnd = addMonths(today, windowMonths);

    // Role scoping (identical to dev-analytics endpoint).
    let orgScope: Prisma.ProjectWhereInput = {};
    if (user.role.role === "PARTNER_ADMIN" && user.role.organizationId) {
      orgScope = { organizationId: user.role.organizationId };
    } else if (user.role.role === "SYSTEM_OWNER") {
      const requestedOrg = searchParams.get("organizationId");
      if (requestedOrg) orgScope = { organizationId: requestedOrg };
    }

    const where: Prisma.ProjectWhereInput = {
      AND: [filterWhere, orgScope],
    };

    // Single fetch — all widgets derive from this set.
    const projects = (await prisma.project.findMany({
      where,
      include: {
        organization: { select: { id: true, name: true } },
        administrativeArea: {
          select: { id: true, name: true, type: true },
        },
        donor: { select: { id: true, name: true } },
      },
    })) as unknown as ProjectForCliff[];

    // -------------------------------------------------------------------------
    // Data quality: record what had to be excluded and why, before filtering.
    // -------------------------------------------------------------------------

    let missingBudgetCount = 0;
    let missingOrInvalidDatesCount = 0;
    let activeMissingEndDateCount = 0;
    let missingDistrictCount = 0;
    let missingDonorCount = 0;
    let completedExcluded = 0;

    const eligibleActive: ProjectForCliff[] = [];
    const eligiblePlanned: ProjectForCliff[] = [];

    for (const p of projects) {
      // Count data-quality issues even if we later exclude the project.
      if (!hasUsableBudget(p)) missingBudgetCount += 1;
      if (!hasUsableDates(p)) missingOrInvalidDatesCount += 1;
      if (!p.administrativeAreaId) missingDistrictCount += 1;
      if (!p.donorId) missingDonorCount += 1;

      if (p.status === "COMPLETED") {
        completedExcluded += 1;
        continue;
      }

      // Projects without usable dates are excluded from calculations but we
      // do flag active projects that lack an end date specifically (since
      // that is the most common cause of silent exclusion).
      if (isActive(p, today) && !p.endDate) {
        activeMissingEndDateCount += 1;
      }

      if (!hasUsableBudget(p)) continue;
      if (!hasUsableDates(p)) continue;

      if (isActive(p, today)) {
        eligibleActive.push(p);
      } else if (p.status === "PLANNED") {
        // Planned replacement candidates must start within the window.
        if (p.startDate && p.startDate.getTime() <= windowEnd.getTime()) {
          eligiblePlanned.push(p);
        }
      }
    }

    // Projects ending within the selected window.
    const expiringActive = eligibleActive.filter(
      (p) =>
        p.endDate !== null &&
        p.endDate.getTime() >= today.getTime() &&
        p.endDate.getTime() <= windowEnd.getTime(),
    );

    // -------------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------------

    const totalActiveBudget = eligibleActive.reduce(
      (acc, p) => acc + (p.budgetUsd ?? 0),
      0,
    );
    const totalExpiringBudget = expiringActive.reduce(
      (acc, p) => acc + (p.budgetUsd ?? 0),
      0,
    );
    const totalPlannedReplacementBudget = eligiblePlanned.reduce(
      (acc, p) => acc + (p.budgetUsd ?? 0),
      0,
    );
    const overallNetExposure = Math.max(
      totalExpiringBudget - totalPlannedReplacementBudget,
      0,
    );
    const overallCliffRiskPercent =
      totalActiveBudget > 0
        ? (overallNetExposure / totalActiveBudget) * 100
        : null;

    const summary = {
      activeBudget: totalActiveBudget,
      expiringBudget: totalExpiringBudget,
      plannedReplacementBudget: totalPlannedReplacementBudget,
      netExposure: overallNetExposure,
      cliffRiskPercent: overallCliffRiskPercent,
      riskLevel: classify(overallCliffRiskPercent),
      activeProjectCount: eligibleActive.length,
      expiringProjectCount: expiringActive.length,
      plannedReplacementProjectCount: eligiblePlanned.length,
    };

    // -------------------------------------------------------------------------
    // By District / County
    // -------------------------------------------------------------------------

    type Bucket = {
      key: string;
      name: string;
      subLabel?: string | null;
      activeBudget: number;
      expiringBudget: number;
      plannedReplacementBudget: number;
      activeProjectCount: number;
      expiringProjectCount: number;
    };

    function ensureBucket(
      map: Map<string, Bucket>,
      key: string,
      name: string,
      subLabel?: string | null,
    ): Bucket {
      let b = map.get(key);
      if (!b) {
        b = {
          key,
          name,
          subLabel: subLabel ?? null,
          activeBudget: 0,
          expiringBudget: 0,
          plannedReplacementBudget: 0,
          activeProjectCount: 0,
          expiringProjectCount: 0,
        };
        map.set(key, b);
      }
      return b;
    }

    // Pre-build sector reference (for display names/colors the frontend can
    // render with a consistent palette).
    const sectorRefs = await prisma.referenceSector.findMany({
      select: { key: true, name: true, color: true },
    });
    const sectorNameByKey = new Map(
      sectorRefs.map((s) => [s.key, s.name] as const),
    );

    const districtBuckets = new Map<string, Bucket>();
    for (const p of eligibleActive) {
      const key = p.administrativeAreaId ?? "__unknown__";
      const name = p.administrativeArea?.name ?? UNKNOWN_DISTRICT;
      const b = ensureBucket(
        districtBuckets,
        key,
        name,
        p.administrativeArea?.type ?? null,
      );
      b.activeBudget += p.budgetUsd ?? 0;
      b.activeProjectCount += 1;
    }
    for (const p of expiringActive) {
      const key = p.administrativeAreaId ?? "__unknown__";
      const name = p.administrativeArea?.name ?? UNKNOWN_DISTRICT;
      const b = ensureBucket(
        districtBuckets,
        key,
        name,
        p.administrativeArea?.type ?? null,
      );
      b.expiringBudget += p.budgetUsd ?? 0;
      b.expiringProjectCount += 1;
    }
    for (const p of eligiblePlanned) {
      const key = p.administrativeAreaId ?? "__unknown__";
      const name = p.administrativeArea?.name ?? UNKNOWN_DISTRICT;
      const b = ensureBucket(
        districtBuckets,
        key,
        name,
        p.administrativeArea?.type ?? null,
      );
      b.plannedReplacementBudget += p.budgetUsd ?? 0;
    }

    const byDistrict: CliffRow[] = Array.from(districtBuckets.values())
      // Suppress rows where we have literally no active budget AND no expiring
      // budget — they add noise without conveying risk.
      .filter(
        (b) => b.activeBudget > 0 || b.expiringBudget > 0,
      )
      .map(buildCliffRow)
      .sort((a, b) => {
        // Sort: cliffRiskPercent desc (nulls last), then expiringBudget desc.
        const aR = a.cliffRiskPercent ?? -1;
        const bR = b.cliffRiskPercent ?? -1;
        if (bR !== aR) return bR - aR;
        return b.expiringBudget - a.expiringBudget;
      });

    // -------------------------------------------------------------------------
    // By Sector
    // -------------------------------------------------------------------------

    const sectorBuckets = new Map<string, Bucket>();
    for (const p of eligibleActive) {
      const name = sectorNameByKey.get(p.sectorKey) ?? p.sectorKey;
      const b = ensureBucket(sectorBuckets, p.sectorKey, name);
      b.activeBudget += p.budgetUsd ?? 0;
      b.activeProjectCount += 1;
    }
    for (const p of expiringActive) {
      const name = sectorNameByKey.get(p.sectorKey) ?? p.sectorKey;
      const b = ensureBucket(sectorBuckets, p.sectorKey, name);
      b.expiringBudget += p.budgetUsd ?? 0;
      b.expiringProjectCount += 1;
    }
    for (const p of eligiblePlanned) {
      const name = sectorNameByKey.get(p.sectorKey) ?? p.sectorKey;
      const b = ensureBucket(sectorBuckets, p.sectorKey, name);
      b.plannedReplacementBudget += p.budgetUsd ?? 0;
    }
    const bySector: CliffRow[] = Array.from(sectorBuckets.values())
      .filter((b) => b.activeBudget > 0 || b.expiringBudget > 0)
      .map(buildCliffRow)
      .sort((a, b) => {
        const aR = a.cliffRiskPercent ?? -1;
        const bR = b.cliffRiskPercent ?? -1;
        if (bR !== aR) return bR - aR;
        return b.expiringBudget - a.expiringBudget;
      });

    // -------------------------------------------------------------------------
    // District × Sector matrix — capped at top-10 × top-10 by active budget.
    // -------------------------------------------------------------------------

    const topDistricts = [...byDistrict]
      .sort((a, b) => b.activeBudget - a.activeBudget)
      .slice(0, MATRIX_TOP_N);
    const topSectors = [...bySector]
      .sort((a, b) => b.activeBudget - a.activeBudget)
      .slice(0, MATRIX_TOP_N);

    const topDistrictKeys = new Set(topDistricts.map((d) => d.key));
    const topSectorKeys = new Set(topSectors.map((s) => s.key));

    const matrixBuckets = new Map<string, Bucket>();
    for (const p of eligibleActive) {
      const dKey = p.administrativeAreaId ?? "__unknown__";
      const sKey = p.sectorKey;
      if (!topDistrictKeys.has(dKey) || !topSectorKeys.has(sKey)) continue;
      const cellKey = `${dKey}::${sKey}`;
      const dName = p.administrativeArea?.name ?? UNKNOWN_DISTRICT;
      const sName = sectorNameByKey.get(sKey) ?? sKey;
      const b = ensureBucket(matrixBuckets, cellKey, `${dName} / ${sName}`);
      b.activeBudget += p.budgetUsd ?? 0;
      b.activeProjectCount += 1;
    }
    for (const p of expiringActive) {
      const dKey = p.administrativeAreaId ?? "__unknown__";
      const sKey = p.sectorKey;
      if (!topDistrictKeys.has(dKey) || !topSectorKeys.has(sKey)) continue;
      const cellKey = `${dKey}::${sKey}`;
      const b = matrixBuckets.get(cellKey);
      if (!b) continue;
      b.expiringBudget += p.budgetUsd ?? 0;
      b.expiringProjectCount += 1;
    }
    for (const p of eligiblePlanned) {
      const dKey = p.administrativeAreaId ?? "__unknown__";
      const sKey = p.sectorKey;
      if (!topDistrictKeys.has(dKey) || !topSectorKeys.has(sKey)) continue;
      const cellKey = `${dKey}::${sKey}`;
      const b = matrixBuckets.get(cellKey);
      if (!b) continue;
      b.plannedReplacementBudget += p.budgetUsd ?? 0;
    }

    const districtSectorMatrix = {
      rows: topDistricts.map((d) => ({
        id: d.key,
        name: d.name,
        subLabel: d.subLabel,
      })),
      columns: topSectors.map((s) => ({ id: s.key, name: s.name })),
      cells: Array.from(matrixBuckets.entries()).map(([compositeKey, b]) => {
        const [districtId, sectorKey] = compositeKey.split("::");
        const row = buildCliffRow(b);
        return {
          districtId,
          sectorKey,
          activeBudget: row.activeBudget,
          expiringBudget: row.expiringBudget,
          plannedReplacementBudget: row.plannedReplacementBudget,
          netExposure: row.netExposure,
          cliffRiskPercent: row.cliffRiskPercent,
          riskLevel: row.riskLevel,
          activeProjectCount: row.activeProjectCount,
          expiringProjectCount: row.expiringProjectCount,
        };
      }),
      note:
        districtBuckets.size > MATRIX_TOP_N ||
        sectorBuckets.size > MATRIX_TOP_N
          ? "Showing top 10 districts and sectors by active recorded budget."
          : null,
      truncated:
        districtBuckets.size > MATRIX_TOP_N ||
        sectorBuckets.size > MATRIX_TOP_N,
      totalDistricts: districtBuckets.size,
      totalSectors: sectorBuckets.size,
    };

    // -------------------------------------------------------------------------
    // Projects ending soon
    // -------------------------------------------------------------------------

    const projectsEndingSoon = expiringActive
      .slice()
      .sort((a, b) => {
        const aEnd = a.endDate?.getTime() ?? Number.POSITIVE_INFINITY;
        const bEnd = b.endDate?.getTime() ?? Number.POSITIVE_INFINITY;
        return aEnd - bEnd;
      })
      .slice(0, PROJECTS_ENDING_SOON_LIMIT)
      .map((p) => ({
        id: p.id,
        title: p.title,
        districtName: p.administrativeArea?.name ?? null,
        districtType: p.administrativeArea?.type ?? null,
        sectorKey: p.sectorKey,
        sectorName: sectorNameByKey.get(p.sectorKey) ?? p.sectorKey,
        donorName: p.donor?.name ?? null,
        organizationName: p.organization.name,
        endDate: p.endDate?.toISOString() ?? null,
        budgetUsd: p.budgetUsd,
        targetBeneficiaries: p.targetBeneficiaries,
        daysUntilEnd: p.endDate
          ? Math.max(
              0,
              Math.round(
                (p.endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
              ),
            )
          : null,
      }));

    // -------------------------------------------------------------------------
    // Top Funding Cliff Alerts (district × sector with risk > 50%)
    // -------------------------------------------------------------------------

    const topAlerts = districtSectorMatrix.cells
      .filter(
        (c) =>
          c.cliffRiskPercent !== null &&
          c.cliffRiskPercent > 50 &&
          c.expiringBudget > 0,
      )
      .map((c) => {
        const district = districtSectorMatrix.rows.find(
          (r) => r.id === c.districtId,
        );
        const sector = districtSectorMatrix.columns.find(
          (s) => s.id === c.sectorKey,
        );
        return {
          districtId: c.districtId,
          districtName: district?.name ?? UNKNOWN_DISTRICT,
          districtType: district?.subLabel ?? null,
          sectorKey: c.sectorKey,
          sectorName: sector?.name ?? c.sectorKey,
          activeBudget: c.activeBudget,
          expiringBudget: c.expiringBudget,
          plannedReplacementBudget: c.plannedReplacementBudget,
          netExposure: c.netExposure,
          cliffRiskPercent: c.cliffRiskPercent,
          riskLevel: c.riskLevel,
        };
      })
      .sort((a, b) => {
        const ap = a.cliffRiskPercent ?? 0;
        const bp = b.cliffRiskPercent ?? 0;
        if (bp !== ap) return bp - ap;
        return b.netExposure - a.netExposure;
      })
      .slice(0, TOP_ALERT_LIMIT);

    // -------------------------------------------------------------------------
    // Donor Exit Exposure
    // -------------------------------------------------------------------------

    interface DonorBucket {
      key: string;
      name: string;
      activeBudget: number;
      expiringBudget: number;
      activeProjectCount: number;
      expiringProjectCount: number;
    }
    const donorBuckets = new Map<string, DonorBucket>();

    function ensureDonor(key: string, name: string): DonorBucket {
      let b = donorBuckets.get(key);
      if (!b) {
        b = {
          key,
          name,
          activeBudget: 0,
          expiringBudget: 0,
          activeProjectCount: 0,
          expiringProjectCount: 0,
        };
        donorBuckets.set(key, b);
      }
      return b;
    }

    for (const p of eligibleActive) {
      const key = p.donorId ?? "__unknown__";
      const name = p.donor?.name ?? UNKNOWN_DONOR;
      const b = ensureDonor(key, name);
      b.activeBudget += p.budgetUsd ?? 0;
      b.activeProjectCount += 1;
    }
    for (const p of expiringActive) {
      const key = p.donorId ?? "__unknown__";
      const name = p.donor?.name ?? UNKNOWN_DONOR;
      const b = ensureDonor(key, name);
      b.expiringBudget += p.budgetUsd ?? 0;
      b.expiringProjectCount += 1;
    }

    const donorExitExposure = Array.from(donorBuckets.values())
      .filter((d) => d.activeBudget > 0)
      .map((d) => {
        const sharePct =
          d.activeBudget > 0 ? (d.expiringBudget / d.activeBudget) * 100 : null;
        return {
          donorId: d.key === "__unknown__" ? null : d.key,
          donorName: d.name,
          activeBudget: d.activeBudget,
          expiringBudget: d.expiringBudget,
          expiringSharePercent: sharePct,
          activeProjectCount: d.activeProjectCount,
          expiringProjectCount: d.expiringProjectCount,
        };
      })
      .sort((a, b) => {
        const aS = a.expiringSharePercent ?? -1;
        const bS = b.expiringSharePercent ?? -1;
        if (bS !== aS) return bS - aS;
        return b.expiringBudget - a.expiringBudget;
      });

    // -------------------------------------------------------------------------
    // Funding Pipeline Timeline (stacked bar)
    //
    // For each of the 4 six-month buckets across 0–24 months:
    //   expiringActiveBudget  = Σ budget of active projects whose endDate
    //                            falls inside the bucket (and on/after today)
    //   plannedStartingBudget = Σ budget of planned projects whose startDate
    //                            falls inside the bucket (and on/after today)
    // -------------------------------------------------------------------------

    const timeline = TIMELINE_BUCKETS.map((b) => {
      const bucketStart = addMonths(today, b.startMonth);
      const bucketEnd = addMonths(today, b.endMonth);

      let expiringBudget = 0;
      let expiringCount = 0;
      for (const p of eligibleActive) {
        if (!p.endDate) continue;
        const t = p.endDate.getTime();
        if (t < today.getTime()) continue;
        if (t >= bucketStart.getTime() && t < bucketEnd.getTime()) {
          expiringBudget += p.budgetUsd ?? 0;
          expiringCount += 1;
        }
      }

      let plannedBudget = 0;
      let plannedCount = 0;
      // For planned: include ALL PLANNED projects with usable budget + dates,
      // not just those within the user-selected cliff window, so that
      // 0–24 month timeline always renders consistently.
      for (const p of projects) {
        if (p.status !== "PLANNED") continue;
        if (!hasUsableBudget(p)) continue;
        if (!hasUsableDates(p)) continue;
        if (!p.startDate) continue;
        const t = p.startDate.getTime();
        if (t < today.getTime()) continue;
        if (t >= bucketStart.getTime() && t < bucketEnd.getTime()) {
          plannedBudget += p.budgetUsd ?? 0;
          plannedCount += 1;
        }
      }

      return {
        key: b.key,
        label: b.label,
        startMonth: b.startMonth,
        endMonth: b.endMonth,
        expiringBudget,
        plannedBudget,
        expiringCount,
        plannedCount,
      };
    });

    // -------------------------------------------------------------------------
    // Data quality block
    // -------------------------------------------------------------------------

    const dataQuality = {
      totalProjects: projects.length,
      eligibleActiveCount: eligibleActive.length,
      eligiblePlannedCount: eligiblePlanned.length,
      expiringCount: expiringActive.length,
      completedExcluded,
      missingBudgetCount,
      missingOrInvalidDatesCount,
      activeMissingEndDateCount,
      missingDistrictCount,
      missingDonorCount,
    };

    // -------------------------------------------------------------------------
    // Notes
    // -------------------------------------------------------------------------

    const notes: string[] = [
      "Funding cliff analysis is based only on recorded project budgets, dates, statuses, donors, sectors, and districts/counties available in the Development Transparency Map. It should be interpreted as a continuity-risk indicator, not a final funding forecast.",
      "Funding cliff risk indicates where recorded active funding is scheduled to end without equivalent recorded planned replacement funding. It does not prove that services will stop or that donors have withdrawn.",
    ];

    // -------------------------------------------------------------------------
    // Applied-filters echo
    // -------------------------------------------------------------------------

    const appliedFilters = {
      countryCode: filterParams.countryCode ?? null,
      administrativeAreaId: filterParams.administrativeAreaId ?? null,
      sectorKey: filterParams.sectorKey ?? null,
      status: filterParams.status ?? null,
      organizationId:
        user.role.role === "PARTNER_ADMIN"
          ? user.role.organizationId ?? null
          : filterParams.organizationId ?? null,
      donorId: filterParams.donorId ?? null,
      activeDuringYear: filterParams.activeDuringYear ?? null,
      budgetTier: filterParams.budgetTier ?? null,
      fundingCliffWindow: windowMonths,
    };

    return NextResponse.json({
      fundingCliffWindow: windowMonths,
      calculatedAt: today.toISOString(),
      windowEnd: windowEnd.toISOString(),
      summary,
      byDistrict,
      bySector,
      districtSectorMatrix,
      projectsEndingSoon,
      topAlerts,
      donorExitExposure,
      timeline,
      dataQuality,
      notes,
      appliedFilters,
      role: user.role.role,
    });
  } catch (err) {
    console.error("[funding-cliffs] unexpected error", err);
    return NextResponse.json(
      { error: "Failed to calculate funding cliff analytics" },
      { status: 500 },
    );
  }
}