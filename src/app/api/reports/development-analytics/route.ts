/**
 * GET /api/reports/development-analytics
 *
 * Development Expert Analytics endpoint.
 *
 * Returns the structured JSON payload that powers the "Reports &
 * Development Intelligence" page. All heavy aggregation lives in this
 * endpoint so the frontend can stay declarative.
 *
 * Access control:
 *   - Unauthenticated callers → 401.
 *   - PARTNER_ADMIN → platform-wide read access to reportable data (own
 *     organisation at any visibility + other organisations' PUBLISHED
 *     projects). Write/manage scope is unchanged and remains own-org only.
 *     See `src/lib/report-scope.ts` for the authoritative rule.
 *   - SYSTEM_OWNER → may pass ?organizationId= to narrow; otherwise sees
 *     every project on the platform.
 *
 * Filters (all optional, parsed via shared helper in `lib/project-filters`):
 *   countryCode, administrativeAreaId, sectorKey, status, organizationId,
 *   donorId, activeDuringYear, budgetTier.
 *
 * Response shape:
 *   {
 *     summaryCards,
 *     distribution: { projectsBySector, budgetBySector, projectsByDistrict,
 *                     budgetByDistrict, projectsByOrganization,
 *                     budgetByOrganization, budgetByDonor },
 *     donorSectorMatrix,
 *     organisationDistrictMatrix,
 *     costPerBeneficiary: { bySector, byDistrict, byDonor, note },
 *     scatterData,
 *     outlierTables: { highestCostPerBeneficiary, highestBudget,
 *                      largestBeneficiaryReach, lowReachHighBudget },
 *     dataCompleteness: { overallPercent, fields[], warnings[] },
 *     appliedFilters,
 *     dataNotes,
 *   }
 *
 * Design rules:
 *   - Never divide by zero; CPB is only calculated across projects with
 *     both budgetUsd > 0 AND targetBeneficiaries > 0.
 *   - Projects without donor are bucketed as "Unknown / Not Provided"
 *     where that makes sense.
 *   - Neutral, development-sector language only.
 */

import { type NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  buildProjectFilterWhere,
  parseProjectFilterParams,
} from "@/lib/project-filters";
import { buildReportOrgVisibilityScope } from "@/lib/report-scope";

const UNKNOWN_DONOR = "Unknown / Not Provided";
const MATRIX_TOP_N = 10;

interface ProjectForAnalytics {
  id: string;
  title: string;
  countryCode: string;
  sectorKey: string;
  status: string;
  visibility: string;
  budgetUsd: number | null;
  targetBeneficiaries: number | null;
  startDate: Date | null;
  endDate: Date | null;
  latitude: number | null;
  longitude: number | null;
  administrativeAreaId: string | null;
  donorId: string | null;
  organizationId: string;
  organization: { id: string; name: string };
  administrativeArea: { id: string; name: string; type: string | null } | null;
  donor: { id: string; name: string } | null;
  sector: { key: string; name: string; color: string } | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

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

    // Role-aware read scope. Reports are a read surface only — PARTNER_ADMIN
    // is NOT locked to their own org here. Write scope (project create/edit/
    // delete, CSV upload) remains own-org-only and is enforced in the
    // corresponding write routes. See `src/lib/report-scope.ts`.
    const orgScope = buildReportOrgVisibilityScope(
      user,
      searchParams.get("organizationId"),
    );

    const where: Prisma.ProjectWhereInput = {
      AND: [filterWhere, orgScope],
    };

    // Single, filter-scoped project fetch — all widgets derive from this set.
    const projects = (await prisma.project.findMany({
      where,
      include: {
        organization: { select: { id: true, name: true } },
        administrativeArea: {
          select: { id: true, name: true, type: true },
        },
        donor: { select: { id: true, name: true } },
      },
    })) as unknown as ProjectForAnalytics[];

    // Enrich sector metadata in one query.
    const sectors = await prisma.referenceSector.findMany();
    const sectorMap = new Map(sectors.map((s) => [s.key, s]));
    for (const p of projects) {
      const s = sectorMap.get(p.sectorKey);
      p.sector = s
        ? { key: s.key, name: s.name, color: s.color }
        : { key: p.sectorKey, name: p.sectorKey, color: "#94a3b8" };
    }

    // =========================================================================
    // PART B — Summary cards
    // =========================================================================
    const totalProjects = projects.length;
    const activeProjects = projects.filter((p) => p.status === "ACTIVE").length;
    const plannedProjects = projects.filter(
      (p) => p.status === "PLANNED",
    ).length;
    const completedProjects = projects.filter(
      (p) => p.status === "COMPLETED",
    ).length;

    const totalRecordedBudget = projects.reduce(
      (acc, p) => acc + (p.budgetUsd ?? 0),
      0,
    );
    const totalTargetBeneficiaries = projects.reduce(
      (acc, p) => acc + (p.targetBeneficiaries ?? 0),
      0,
    );

    const implementingOrgIds = new Set(
      projects.map((p) => p.organizationId).filter(Boolean),
    );
    const donorIdsSeen = new Set(
      projects.map((p) => p.donorId).filter((id): id is string => !!id),
    );
    const districtIdsSeen = new Set(
      projects
        .map((p) => p.administrativeAreaId)
        .filter((id): id is string => !!id),
    );

    // Average cost per beneficiary: only projects with both valid budget and
    // valid target beneficiaries contribute to numerator & denominator.
    const cpbValidProjects = projects.filter(
      (p) =>
        p.budgetUsd != null &&
        p.budgetUsd > 0 &&
        p.targetBeneficiaries != null &&
        p.targetBeneficiaries > 0,
    );
    const cpbBudgetSum = cpbValidProjects.reduce(
      (acc, p) => acc + (p.budgetUsd ?? 0),
      0,
    );
    const cpbBeneficiarySum = cpbValidProjects.reduce(
      (acc, p) => acc + (p.targetBeneficiaries ?? 0),
      0,
    );
    const avgCostPerBeneficiary =
      cpbBeneficiarySum > 0 ? cpbBudgetSum / cpbBeneficiarySum : null;

    const summaryCards = {
      totalProjects,
      activeProjects,
      plannedProjects,
      completedProjects,
      totalRecordedBudget,
      totalTargetBeneficiaries,
      implementingOrganizations: implementingOrgIds.size,
      donors: donorIdsSeen.size,
      districtsCovered: districtIdsSeen.size,
      avgCostPerBeneficiary, // null when insufficient data
      cpbValidProjectCount: cpbValidProjects.length,
    };

    // =========================================================================
    // PART B.1 — Budget Pipeline by Status
    // =========================================================================
    // Aggregates recorded budget and project counts per project status bucket.
    // Consumed by the "Budget Pipeline by Status" widget on the Reports page.
    // Statuses align with Project.status ("ACTIVE" / "PLANNED" / "COMPLETED").
    // Other / unrecognised statuses are grouped under "OTHER" defensively so
    // the widget never silently drops rows if the enum is extended upstream.
    const pipelineStatuses = ["ACTIVE", "PLANNED", "COMPLETED"] as const;
    const budgetByStatus: Record<
      string,
      { status: string; projectCount: number; recordedBudget: number }
    > = {
      ACTIVE: { status: "ACTIVE", projectCount: 0, recordedBudget: 0 },
      PLANNED: { status: "PLANNED", projectCount: 0, recordedBudget: 0 },
      COMPLETED: { status: "COMPLETED", projectCount: 0, recordedBudget: 0 },
    };
    let otherStatusCount = 0;
    let otherStatusBudget = 0;
    for (const p of projects) {
      const bucket = budgetByStatus[p.status];
      if (bucket) {
        bucket.projectCount += 1;
        bucket.recordedBudget += p.budgetUsd ?? 0;
      } else {
        otherStatusCount += 1;
        otherStatusBudget += p.budgetUsd ?? 0;
      }
    }
    const budgetPipelineByStatus = pipelineStatuses
      .map((s) => budgetByStatus[s])
      .concat(
        otherStatusCount > 0
          ? [
              {
                status: "OTHER",
                projectCount: otherStatusCount,
                recordedBudget: otherStatusBudget,
              },
            ]
          : [],
      );

    // =========================================================================
    // PART C — Development Distribution
    // =========================================================================
    type Bucket = {
      key: string;
      label: string;
      color?: string;
      count: number;
      budget: number;
    };

    function addToBucket(
      map: Map<string, Bucket>,
      key: string,
      label: string,
      budget: number,
      color?: string,
    ) {
      const b = map.get(key);
      if (b) {
        b.count += 1;
        b.budget += budget;
      } else {
        map.set(key, { key, label, color, count: 1, budget });
      }
    }

    const sectorBuckets = new Map<string, Bucket>();
    const districtBuckets = new Map<string, Bucket>();
    const orgBuckets = new Map<string, Bucket>();
    const donorBuckets = new Map<string, Bucket>();

    for (const p of projects) {
      const budget = p.budgetUsd ?? 0;
      // Sector
      addToBucket(
        sectorBuckets,
        p.sector?.key ?? p.sectorKey,
        p.sector?.name ?? p.sectorKey,
        budget,
        p.sector?.color,
      );
      // District / County (skip if missing — surfaced via completeness)
      if (p.administrativeArea) {
        addToBucket(
          districtBuckets,
          p.administrativeArea.id,
          p.administrativeArea.type
            ? `${p.administrativeArea.name} · ${p.administrativeArea.type}`
            : p.administrativeArea.name,
          budget,
        );
      }
      // Organisation
      addToBucket(
        orgBuckets,
        p.organization.id,
        p.organization.name,
        budget,
      );
      // Donor
      if (p.donor) {
        addToBucket(donorBuckets, p.donor.id, p.donor.name, budget);
      } else {
        addToBucket(donorBuckets, "_unknown", UNKNOWN_DONOR, budget);
      }
    }

    const distribution = {
      projectsBySector: [...sectorBuckets.values()]
        .map((b) => ({
          key: b.key,
          name: b.label,
          color: b.color,
          count: b.count,
        }))
        .sort((a, b) => b.count - a.count),
      budgetBySector: [...sectorBuckets.values()]
        .map((b) => ({
          key: b.key,
          name: b.label,
          color: b.color,
          budget: b.budget,
        }))
        .sort((a, b) => b.budget - a.budget),
      projectsByDistrict: [...districtBuckets.values()]
        .map((b) => ({ key: b.key, name: b.label, count: b.count }))
        .sort((a, b) => b.count - a.count),
      budgetByDistrict: [...districtBuckets.values()]
        .map((b) => ({ key: b.key, name: b.label, budget: b.budget }))
        .sort((a, b) => b.budget - a.budget),
      projectsByOrganization: [...orgBuckets.values()]
        .map((b) => ({ key: b.key, name: b.label, count: b.count }))
        .sort((a, b) => b.count - a.count),
      budgetByOrganization: [...orgBuckets.values()]
        .map((b) => ({ key: b.key, name: b.label, budget: b.budget }))
        .sort((a, b) => b.budget - a.budget),
      budgetByDonor: [...donorBuckets.values()]
        .map((b) => ({ key: b.key, name: b.label, budget: b.budget }))
        .sort((a, b) => b.budget - a.budget),
    };

    // =========================================================================
    // PART D — Donor / Actor intelligence matrices
    // =========================================================================
    // Donor-to-Sector: rows = donors (incl. Unknown bucket if >0), cols = sectors.
    // Cell value is total budget by default; also include projectCount for
    // fallback rendering when budget data is sparse.
    const donorSectorTotals = new Map<
      string,
      { budget: number; count: number }
    >();
    const allDonorKeys = new Set<string>();
    const allSectorKeys = new Set<string>();

    for (const p of projects) {
      const donorKey = p.donor ? p.donor.id : "_unknown";
      const donorLabel = p.donor ? p.donor.name : UNKNOWN_DONOR;
      const sectorKey = p.sector?.key ?? p.sectorKey;
      const cellKey = `${donorKey}::${sectorKey}`;
      allDonorKeys.add(`${donorKey}::${donorLabel}`);
      allSectorKeys.add(sectorKey);
      const cell = donorSectorTotals.get(cellKey) ?? { budget: 0, count: 0 };
      cell.budget += p.budgetUsd ?? 0;
      cell.count += 1;
      donorSectorTotals.set(cellKey, cell);
    }

    // Project budget coverage check — used to decide the matrix metric.
    const budgetCoverage =
      totalProjects === 0
        ? 0
        : projects.filter((p) => p.budgetUsd != null && p.budgetUsd > 0)
            .length / totalProjects;

    const donorSectorMetric = budgetCoverage >= 0.3 ? "budget" : "count";

    const donorRows = [...allDonorKeys].map((k) => {
      const [id, ...rest] = k.split("::");
      return { id, name: rest.join("::") };
    });
    const sectorCols = [...allSectorKeys].map((k) => ({
      key: k,
      name: sectorMap.get(k)?.name ?? k,
    }));

    // Sort donors by row-total (budget or count), sectors likewise.
    const donorRowTotal = (donorId: string) => {
      let v = 0;
      for (const sk of allSectorKeys) {
        const cell = donorSectorTotals.get(`${donorId}::${sk}`);
        v += cell
          ? donorSectorMetric === "budget"
            ? cell.budget
            : cell.count
          : 0;
      }
      return v;
    };
    const sectorColTotal = (sKey: string) => {
      let v = 0;
      for (const { id } of donorRows) {
        const cell = donorSectorTotals.get(`${id}::${sKey}`);
        v += cell
          ? donorSectorMetric === "budget"
            ? cell.budget
            : cell.count
          : 0;
      }
      return v;
    };
    donorRows.sort((a, b) => donorRowTotal(b.id) - donorRowTotal(a.id));
    sectorCols.sort((a, b) => sectorColTotal(b.key) - sectorColTotal(a.key));

    const donorSectorMatrix = {
      metric: donorSectorMetric as "budget" | "count",
      rows: donorRows,
      columns: sectorCols,
      cells: [...donorSectorTotals.entries()].map(([k, v]) => {
        const [donorId, sectorKey] = k.split("::");
        return {
          rowId: donorId,
          columnKey: sectorKey,
          budget: v.budget,
          count: v.count,
        };
      }),
      note:
        donorSectorMetric === "budget"
          ? null
          : "Showing project counts because most filtered projects are missing budget data.",
    };

    // Organisation-to-District: rows = orgs, cols = districts (count only).
    const orgDistrictCounts = new Map<string, number>();
    const orgTotalsCount = new Map<string, { name: string; count: number }>();
    const districtTotalsCount = new Map<
      string,
      { name: string; count: number }
    >();

    for (const p of projects) {
      if (!p.administrativeArea) continue;
      const orgId = p.organization.id;
      const aId = p.administrativeArea.id;
      const cellKey = `${orgId}::${aId}`;
      orgDistrictCounts.set(cellKey, (orgDistrictCounts.get(cellKey) ?? 0) + 1);
      const ot = orgTotalsCount.get(orgId) ?? {
        name: p.organization.name,
        count: 0,
      };
      ot.count += 1;
      orgTotalsCount.set(orgId, ot);
      const dt = districtTotalsCount.get(aId) ?? {
        name: p.administrativeArea.type
          ? `${p.administrativeArea.name} · ${p.administrativeArea.type}`
          : p.administrativeArea.name,
        count: 0,
      };
      dt.count += 1;
      districtTotalsCount.set(aId, dt);
    }

    const topOrgs = [...orgTotalsCount.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, MATRIX_TOP_N)
      .map(([id, v]) => ({ id, name: v.name, total: v.count }));
    const topDistricts = [...districtTotalsCount.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, MATRIX_TOP_N)
      .map(([id, v]) => ({ id, name: v.name, total: v.count }));

    const orgDistrictCells: Array<{
      rowId: string;
      columnId: string;
      count: number;
    }> = [];
    for (const { id: orgId } of topOrgs) {
      for (const { id: aId } of topDistricts) {
        const count = orgDistrictCounts.get(`${orgId}::${aId}`) ?? 0;
        if (count > 0) {
          orgDistrictCells.push({ rowId: orgId, columnId: aId, count });
        }
      }
    }

    const truncated =
      orgTotalsCount.size > MATRIX_TOP_N ||
      districtTotalsCount.size > MATRIX_TOP_N;

    const organisationDistrictMatrix = {
      rows: topOrgs,
      columns: topDistricts,
      cells: orgDistrictCells,
      totalOrganizations: orgTotalsCount.size,
      totalDistricts: districtTotalsCount.size,
      note: truncated
        ? `Showing top ${MATRIX_TOP_N} by project count.`
        : null,
    };

    // =========================================================================
    // PART E — Cost Per Beneficiary analytics
    // =========================================================================
    function cpbGroup<T extends string>(
      keyFn: (p: ProjectForAnalytics) => T | null,
      nameFn: (p: ProjectForAnalytics) => string,
    ) {
      const map = new Map<
        string,
        { key: string; name: string; budget: number; beneficiaries: number }
      >();
      for (const p of cpbValidProjects) {
        const k = keyFn(p);
        if (!k) continue;
        const entry = map.get(k) ?? {
          key: k,
          name: nameFn(p),
          budget: 0,
          beneficiaries: 0,
        };
        entry.budget += p.budgetUsd ?? 0;
        entry.beneficiaries += p.targetBeneficiaries ?? 0;
        map.set(k, entry);
      }
      return [...map.values()]
        .map((e) => ({
          key: e.key,
          name: e.name,
          budget: e.budget,
          beneficiaries: e.beneficiaries,
          cpb: e.beneficiaries > 0 ? e.budget / e.beneficiaries : null,
        }))
        .filter((e) => e.cpb != null)
        .sort((a, b) => (b.cpb ?? 0) - (a.cpb ?? 0));
    }

    const costPerBeneficiary = {
      bySector: cpbGroup(
        (p) => p.sector?.key ?? p.sectorKey,
        (p) => p.sector?.name ?? p.sectorKey,
      ),
      byDistrict: cpbGroup(
        (p) => (p.administrativeArea ? p.administrativeArea.id : null),
        (p) =>
          p.administrativeArea
            ? p.administrativeArea.type
              ? `${p.administrativeArea.name} · ${p.administrativeArea.type}`
              : p.administrativeArea.name
            : "",
      ),
      byDonor: cpbGroup(
        (p) => (p.donor ? p.donor.id : "_unknown"),
        (p) => (p.donor ? p.donor.name : UNKNOWN_DONOR),
      ),
      validProjectCount: cpbValidProjects.length,
      note: "Cost per beneficiary is calculated only from projects with both recorded budget and target beneficiary values.",
    };

    // =========================================================================
    // PART F — Scatter plot data
    // =========================================================================
    const scatterData = cpbValidProjects.map((p) => ({
      id: p.id,
      title: p.title,
      sectorName: p.sector?.name ?? p.sectorKey,
      districtName: p.administrativeArea
        ? p.administrativeArea.type
          ? `${p.administrativeArea.name} · ${p.administrativeArea.type}`
          : p.administrativeArea.name
        : null,
      donorName: p.donor?.name ?? null,
      organizationName: p.organization.name,
      budget: p.budgetUsd ?? 0,
      beneficiaries: p.targetBeneficiaries ?? 0,
      cpb:
        p.targetBeneficiaries && p.targetBeneficiaries > 0
          ? (p.budgetUsd ?? 0) / p.targetBeneficiaries
          : null,
    }));

    // =========================================================================
    // PART G — Outlier tables
    // =========================================================================
    function projectRow(p: ProjectForAnalytics) {
      const cpb =
        p.budgetUsd != null &&
        p.budgetUsd > 0 &&
        p.targetBeneficiaries != null &&
        p.targetBeneficiaries > 0
          ? p.budgetUsd / p.targetBeneficiaries
          : null;
      return {
        id: p.id,
        title: p.title,
        sectorName: p.sector?.name ?? p.sectorKey,
        districtName: p.administrativeArea
          ? p.administrativeArea.type
            ? `${p.administrativeArea.name} · ${p.administrativeArea.type}`
            : p.administrativeArea.name
          : null,
        donorName: p.donor?.name ?? null,
        organizationName: p.organization.name,
        budget: p.budgetUsd,
        beneficiaries: p.targetBeneficiaries,
        cpb,
      };
    }

    const highestCostPerBeneficiary = cpbValidProjects
      .map(projectRow)
      .sort((a, b) => (b.cpb ?? 0) - (a.cpb ?? 0))
      .slice(0, 10);

    const highestBudget = projects
      .filter((p) => p.budgetUsd != null && p.budgetUsd > 0)
      .map(projectRow)
      .sort((a, b) => (b.budget ?? 0) - (a.budget ?? 0))
      .slice(0, 10);

    const largestBeneficiaryReach = projects
      .filter((p) => p.targetBeneficiaries != null && p.targetBeneficiaries > 0)
      .map(projectRow)
      .sort((a, b) => (b.beneficiaries ?? 0) - (a.beneficiaries ?? 0))
      .slice(0, 10);

    // Low-reach high-budget watchlist — only over the dataset medians.
    const budgetValues = projects
      .filter((p) => p.budgetUsd != null && p.budgetUsd > 0)
      .map((p) => p.budgetUsd as number);
    const benValues = projects
      .filter(
        (p) => p.targetBeneficiaries != null && p.targetBeneficiaries > 0,
      )
      .map((p) => p.targetBeneficiaries as number);
    const medianBudget = median(budgetValues);
    const medianBeneficiaries = median(benValues);

    const lowReachHighBudget =
      medianBudget != null && medianBeneficiaries != null
        ? projects
            .filter(
              (p) =>
                p.budgetUsd != null &&
                p.budgetUsd > medianBudget &&
                p.targetBeneficiaries != null &&
                p.targetBeneficiaries > 0 &&
                p.targetBeneficiaries < medianBeneficiaries,
            )
            .map(projectRow)
            .sort((a, b) => (b.budget ?? 0) - (a.budget ?? 0))
            .slice(0, 10)
        : [];

    const outlierTables = {
      highestCostPerBeneficiary,
      highestBudget,
      largestBeneficiaryReach,
      lowReachHighBudget,
      lowReachHighBudgetNote:
        "These projects may be valid infrastructure, systems-strengthening, specialist, or capital-intensive interventions. This table is intended to flag records for review, not to make a judgement.",
      medianBudget,
      medianBeneficiaries,
    };

    // =========================================================================
    // PART H — Data Completeness
    // =========================================================================
    type FieldKey =
      | "administrativeArea"
      | "donor"
      | "budget"
      | "beneficiaries"
      | "startDate"
      | "endDate"
      | "sector"
      | "status"
      | "latitude"
      | "longitude";

    const fieldChecks: Array<{ key: FieldKey; label: string; has: (p: ProjectForAnalytics) => boolean }> = [
      {
        key: "administrativeArea",
        label: "District / County",
        has: (p) => !!p.administrativeAreaId,
      },
      { key: "donor", label: "Donor", has: (p) => !!p.donorId },
      {
        key: "budget",
        label: "Budget",
        has: (p) => p.budgetUsd != null && p.budgetUsd > 0,
      },
      {
        key: "beneficiaries",
        label: "Target Beneficiaries",
        has: (p) => p.targetBeneficiaries != null && p.targetBeneficiaries > 0,
      },
      {
        key: "startDate",
        label: "Start Date",
        has: (p) => !!p.startDate,
      },
      {
        key: "endDate",
        label: "End Date",
        has: (p) => !!p.endDate,
      },
      { key: "sector", label: "Sector", has: (p) => !!p.sectorKey },
      { key: "status", label: "Status", has: (p) => !!p.status },
      {
        key: "latitude",
        label: "Latitude",
        has: (p) => p.latitude != null && !Number.isNaN(p.latitude),
      },
      {
        key: "longitude",
        label: "Longitude",
        has: (p) => p.longitude != null && !Number.isNaN(p.longitude),
      },
    ];

    const fieldRows = fieldChecks.map((f) => {
      const complete = projects.filter(f.has).length;
      const missing = totalProjects - complete;
      return {
        field: f.label,
        key: f.key,
        complete,
        missing,
        percent: totalProjects > 0 ? (complete / totalProjects) * 100 : 0,
      };
    });

    const expectedFieldCount = totalProjects * fieldChecks.length;
    const completedFieldCount = fieldRows.reduce((a, r) => a + r.complete, 0);
    const overallPercent =
      expectedFieldCount > 0
        ? (completedFieldCount / expectedFieldCount) * 100
        : 0;

    const warnings: string[] = [];
    if (totalProjects > 0) {
      const pctMissing = (key: FieldKey) => {
        const row = fieldRows.find((r) => r.key === key);
        if (!row) return 0;
        return (row.missing / totalProjects) * 100;
      };
      if (pctMissing("donor") > 30) {
        warnings.push("More than 30% of projects are missing donor data.");
      }
      if (pctMissing("budget") > 30) {
        warnings.push("More than 30% of projects are missing budget data.");
      }
      if (pctMissing("beneficiaries") > 30) {
        warnings.push(
          "More than 30% of projects are missing target beneficiary data.",
        );
      }
      if (pctMissing("administrativeArea") > 30) {
        warnings.push(
          "More than 30% of projects are missing District / County data.",
        );
      }
      const invalidDates = projects.filter((p) => {
        if (!p.startDate) return true;
        if (p.endDate && p.endDate < p.startDate) return true;
        return false;
      }).length;
      if (invalidDates > 0) {
        warnings.push("Some projects have invalid or missing date ranges.");
      }
    }

    const dataCompleteness = {
      overallPercent,
      totalProjects,
      fields: fieldRows,
      warnings,
    };

    // =========================================================================
    // Applied filters (echoed back for UI display) + top-level notes
    // =========================================================================
    const appliedFilters = {
      countryCode: filterParams.countryCode ?? null,
      administrativeAreaId: filterParams.administrativeAreaId ?? null,
      sectorKey: filterParams.sectorKey ?? null,
      status: filterParams.status ?? null,
      // Echo the filter the client actually selected (if any). No forced
      // override for PARTNER_ADMIN — the read-scope guard is applied in
      // Prisma, not in the echoed filter state.
      organizationId: filterParams.organizationId ?? null,
      donorId: filterParams.donorId ?? null,
      activeDuringYear: filterParams.activeDuringYear ?? null,
      budgetTier: filterParams.budgetTier ?? null,
    };

    const dataNotes = [
      "Analytics are based only on project records currently available in the Development Transparency Map. Missing or incomplete project data may affect interpretation.",
    ];

    return NextResponse.json({
      summaryCards,
      distribution,
      donorSectorMatrix,
      organisationDistrictMatrix,
      costPerBeneficiary,
      scatterData,
      outlierTables,
      dataCompleteness,
      budgetPipelineByStatus,
      appliedFilters,
      dataNotes,
      role: user.role.role,
    });
  } catch (error) {
    console.error("Development analytics error:", error);
    return NextResponse.json(
      { error: "Failed to load development analytics" },
      { status: 500 },
    );
  }
}