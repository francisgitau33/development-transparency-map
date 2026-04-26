"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { useAuth } from "@/lib/auth-context";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  DollarSign,
  Filter,
  FolderOpen,
  Globe,
  Info,
  Layers,
  Lock,
  MapPin,
  Network,
  ShieldAlert,
  Sprout,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  X,
} from "lucide-react";

// =============================================================================
// Types for the /api/reports/development-analytics response
// =============================================================================

interface SummaryCards {
  totalProjects: number;
  activeProjects: number;
  plannedProjects: number;
  completedProjects: number;
  totalRecordedBudget: number;
  totalTargetBeneficiaries: number;
  implementingOrganizations: number;
  donors: number;
  districtsCovered: number;
  avgCostPerBeneficiary: number | null;
  cpbValidProjectCount: number;
}

interface NamedCount {
  key: string;
  name: string;
  color?: string;
  count: number;
}
interface NamedBudget {
  key: string;
  name: string;
  color?: string;
  budget: number;
}

interface Distribution {
  projectsBySector: NamedCount[];
  budgetBySector: NamedBudget[];
  projectsByDistrict: NamedCount[];
  budgetByDistrict: NamedBudget[];
  projectsByOrganization: NamedCount[];
  budgetByOrganization: NamedBudget[];
  budgetByDonor: NamedBudget[];
}

interface DonorSectorMatrix {
  metric: "budget" | "count";
  rows: Array<{ id: string; name: string }>;
  columns: Array<{ key: string; name: string }>;
  cells: Array<{
    rowId: string;
    columnKey: string;
    budget: number;
    count: number;
  }>;
  note: string | null;
}

interface OrgDistrictMatrix {
  rows: Array<{ id: string; name: string; total: number }>;
  columns: Array<{ id: string; name: string; total: number }>;
  cells: Array<{ rowId: string; columnId: string; count: number }>;
  totalOrganizations: number;
  totalDistricts: number;
  note: string | null;
}

interface CpbRow {
  key: string;
  name: string;
  budget: number;
  beneficiaries: number;
  cpb: number | null;
}
interface CostPerBeneficiary {
  bySector: CpbRow[];
  byDistrict: CpbRow[];
  byDonor: CpbRow[];
  validProjectCount: number;
  note: string;
}

interface ScatterPoint {
  id: string;
  title: string;
  sectorName: string;
  districtName: string | null;
  donorName: string | null;
  organizationName: string;
  budget: number;
  beneficiaries: number;
  cpb: number | null;
}

interface OutlierRow {
  id: string;
  title: string;
  sectorName: string;
  districtName: string | null;
  donorName: string | null;
  organizationName: string;
  budget: number | null;
  beneficiaries: number | null;
  cpb: number | null;
}
interface OutlierTables {
  highestCostPerBeneficiary: OutlierRow[];
  highestBudget: OutlierRow[];
  largestBeneficiaryReach: OutlierRow[];
  lowReachHighBudget: OutlierRow[];
  lowReachHighBudgetNote: string;
  medianBudget: number | null;
  medianBeneficiaries: number | null;
}

interface DataCompletenessField {
  field: string;
  key: string;
  complete: number;
  missing: number;
  percent: number;
}
interface DataCompleteness {
  overallPercent: number;
  totalProjects: number;
  fields: DataCompletenessField[];
  warnings: string[];
}

interface BudgetPipelineRow {
  status: string;
  projectCount: number;
  recordedBudget: number;
}

interface Analytics {
  summaryCards: SummaryCards;
  distribution: Distribution;
  donorSectorMatrix: DonorSectorMatrix;
  organisationDistrictMatrix: OrgDistrictMatrix;
  costPerBeneficiary: CostPerBeneficiary;
  scatterData: ScatterPoint[];
  outlierTables: OutlierTables;
  dataCompleteness: DataCompleteness;
  budgetPipelineByStatus: BudgetPipelineRow[];
  appliedFilters: Record<string, string | null>;
  dataNotes: string[];
  role: "SYSTEM_OWNER" | "PARTNER_ADMIN";
}

// ---------------------------------------------------------------------------
// Funding-cliff analytics (served by /api/reports/funding-cliffs).
// ---------------------------------------------------------------------------

type RiskLevel = "Low" | "Moderate" | "High" | "Severe" | "Insufficient data";

interface CliffSummary {
  activeBudget: number;
  expiringBudget: number;
  plannedReplacementBudget: number;
  netExposure: number;
  cliffRiskPercent: number | null;
  riskLevel: RiskLevel;
  activeProjectCount: number;
  expiringProjectCount: number;
  plannedReplacementProjectCount: number;
}

interface CliffGroupRow {
  key: string;
  name: string;
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

interface CliffMatrixCell {
  districtId: string;
  sectorKey: string;
  activeBudget: number;
  expiringBudget: number;
  plannedReplacementBudget: number;
  netExposure: number;
  cliffRiskPercent: number | null;
  riskLevel: RiskLevel;
}
interface CliffMatrix {
  rows: Array<{ id: string; name: string; subLabel?: string | null }>;
  columns: Array<{ id: string; name: string }>;
  cells: CliffMatrixCell[];
  note: string | null;
  truncated: boolean;
  totalDistricts: number;
  totalSectors: number;
}

interface ProjectEndingSoon {
  id: string;
  title: string;
  districtName: string | null;
  districtType: string | null;
  sectorKey: string;
  sectorName: string;
  donorName: string | null;
  organizationName: string;
  endDate: string | null;
  budgetUsd: number | null;
  targetBeneficiaries: number | null;
  daysUntilEnd: number | null;
}

interface TopAlert {
  districtId: string;
  districtName: string;
  districtType: string | null;
  sectorKey: string;
  sectorName: string;
  activeBudget: number;
  expiringBudget: number;
  plannedReplacementBudget: number;
  netExposure: number;
  cliffRiskPercent: number | null;
  riskLevel: RiskLevel;
}

interface DonorExitExposureRow {
  donorId: string | null;
  donorName: string;
  activeBudget: number;
  expiringBudget: number;
  expiringSharePercent: number | null;
  activeProjectCount: number;
  expiringProjectCount: number;
}

interface TimelineBucket {
  key: string;
  label: string;
  startMonth: number;
  endMonth: number;
  expiringBudget: number;
  plannedBudget: number;
  expiringCount: number;
  plannedCount: number;
}

interface CliffDataQuality {
  totalProjects: number;
  eligibleActiveCount: number;
  eligiblePlannedCount: number;
  expiringCount: number;
  completedExcluded: number;
  missingBudgetCount: number;
  missingOrInvalidDatesCount: number;
  activeMissingEndDateCount: number;
  missingDistrictCount: number;
  missingDonorCount: number;
}

interface FundingCliffs {
  fundingCliffWindow: number;
  calculatedAt: string;
  windowEnd: string;
  summary: CliffSummary;
  byDistrict: CliffGroupRow[];
  bySector: CliffGroupRow[];
  districtSectorMatrix: CliffMatrix;
  projectsEndingSoon: ProjectEndingSoon[];
  topAlerts: TopAlert[];
  donorExitExposure: DonorExitExposureRow[];
  timeline: TimelineBucket[];
  dataQuality: CliffDataQuality;
  notes: string[];
  appliedFilters: Record<string, string | number | null>;
  role: "SYSTEM_OWNER" | "PARTNER_ADMIN";
}

// ---------------------------------------------------------------------------
// Spatial-vulnerability analytics (served by /api/reports/spatial-vulnerability).
// ---------------------------------------------------------------------------

type SpatialIndicatorLabel =
  | "Lower recorded spatial vulnerability"
  | "Moderate recorded spatial vulnerability"
  | "High recorded spatial vulnerability"
  | "Severe recorded spatial vulnerability";

interface LowestIpb {
  areaId: string;
  areaName: string;
  areaType: string | null;
  countryCode: string;
  countryName: string;
  investmentPerBeneficiary: number;
  totalBudget: number;
  totalBeneficiaries: number;
  activeCount: number;
  plannedCount: number;
}

interface SpatialSummary {
  totalAdministrativeAreas: number;
  areasWithActiveProjects: number;
  areasWithPlannedProjects: number;
  areasWithNoActiveOrPlannedProjects: number;
  areasWithAnyCoverage: number;
  geographicCoverageRatio: number | null;
  lowestInvestmentPerBeneficiary: LowestIpb | null;
  calculableInvestmentPerBeneficiaryAreas: number;
}

interface NoCoverageRow {
  areaId: string;
  areaName: string;
  areaType: string | null;
  countryCode: string;
  countryName: string;
  activeCount: number;
  plannedCount: number;
  completedCount: number;
  lastRecordedEndDate: string | null;
  note: string;
}

interface LowCoverageRow {
  areaId: string;
  areaName: string;
  areaType: string | null;
  countryCode: string;
  countryName: string;
  activeCount: number;
  plannedCount: number;
  completedCount: number;
  totalBudget: number;
  totalBeneficiaries: number;
  investmentPerBeneficiary: number | null;
}

interface IpbRow {
  areaId: string;
  areaName: string;
  areaType: string | null;
  countryCode: string;
  countryName: string;
  investmentPerBeneficiary: number;
  totalBudget: number;
  totalBeneficiaries: number;
  activeCount: number;
  plannedCount: number;
}

interface SectorCoverageCell {
  areaId: string;
  sectorKey: string;
  active: number;
  planned: number;
  total: number;
}

interface SectorCoverageMatrix {
  rows: Array<{
    id: string;
    name: string;
    subLabel?: string | null;
    countryName: string;
  }>;
  columns: Array<{ key: string; name: string }>;
  cells: SectorCoverageCell[];
  note: string | null;
  truncated: boolean;
  totalAreas: number;
  totalSectors: number;
}

interface WatchlistRow {
  areaId: string;
  areaName: string;
  areaType: string | null;
  countryCode: string;
  countryName: string;
  activeCount: number;
  plannedCount: number;
  totalBudget: number;
  totalBeneficiaries: number;
  investmentPerBeneficiary: number | null;
  reasons: string[];
  completenessNote: string;
  spatialVulnerabilityScore: number;
  spatialVulnerabilityLabel: SpatialIndicatorLabel;
}

interface SpatialIndicatorRow {
  areaId: string;
  areaName: string;
  areaType: string | null;
  countryCode: string;
  countryName: string;
  score: number;
  label: SpatialIndicatorLabel;
  contributingFactors: string[];
}

interface SpatialDataQuality {
  totalAdministrativeAreas: number;
  administrativeAreasWithNoProjects: number;
  administrativeAreasExcludedInactive: number;
  projectsConsidered: number;
  projectsMissingDistrict: number;
  projectsMissingBudget: number;
  projectsMissingBeneficiaries: number;
  areasInvestmentPerBeneficiaryUncalculable: number;
  areasWithNoActiveOrPlannedProjects: number;
  // Population completeness (Part E).
  areasWithPopulation: number;
  areasMissingPopulation: number;
  populationCompletenessPercent: number | null;
  populationSourceCompletenessPercent: number | null;
  populationYearMin: number | null;
  populationYearMax: number | null;
  populationYearSpread: number | null;
  populationYearMixedNote: string | null;
  missingPopulationByCountry: Array<{
    countryCode: string;
    countryName: string;
    missingCount: number;
    totalActive: number;
    missingAreaNames: string[];
  }>;
}

// Serialized PopulationWeightedResult (see src/lib/population-metrics.ts).
interface PwrCell {
  value: number | null;
  label: string | null;
  reason:
    | "missing-population"
    | "missing-budget"
    | "missing-beneficiaries"
    | "zero-population"
    | null;
}

interface InvestmentPerCapitaRow {
  areaId: string;
  areaName: string;
  areaType: string | null;
  countryCode: string;
  countryName: string;
  estimatedPopulation: number | null;
  populationYear: number | null;
  totalBudget: number;
  investmentPerCapita: PwrCell;
}

interface ProjectsPer100kRow {
  areaId: string;
  areaName: string;
  areaType: string | null;
  countryCode: string;
  countryName: string;
  estimatedPopulation: number | null;
  populationYear: number | null;
  activeOrPlannedCount: number;
  projectsPer100k: PwrCell;
}

interface BeneficiaryReachRow {
  areaId: string;
  areaName: string;
  areaType: string | null;
  countryCode: string;
  countryName: string;
  estimatedPopulation: number | null;
  populationYear: number | null;
  totalBeneficiaries: number;
  beneficiaryReachPercent: PwrCell;
}

interface HighPopulationLowCoverageRow {
  areaId: string;
  areaName: string;
  areaType: string | null;
  countryCode: string;
  countryName: string;
  estimatedPopulation: number | null;
  populationYear: number | null;
  activeCount: number;
  plannedCount: number;
  totalBudget: number;
  investmentPerCapita: PwrCell;
  projectsPer100k: PwrCell;
  beneficiaryReachPercent: PwrCell;
  reasons: string[];
  dataCompletenessNote: string;
}

interface SpatialVulnerability {
  calculatedAt: string;
  summary: SpatialSummary;
  noRecordedActiveOrPlanned: NoCoverageRow[];
  lowCoverageByArea: LowCoverageRow[];
  investmentPerBeneficiaryByArea: IpbRow[];
  sectorCoverageMatrix: SectorCoverageMatrix | null;
  underservedWatchlist: WatchlistRow[];
  spatialVulnerabilityIndicator: SpatialIndicatorRow[];
  // Population-weighted tables (Part F).
  investmentPerCapitaByArea: InvestmentPerCapitaRow[];
  projectsPer100kByArea: ProjectsPer100kRow[];
  beneficiaryReachByArea: BeneficiaryReachRow[];
  beneficiaryReachHasOver100: boolean;
  highPopulationLowCoverageWatchlist: HighPopulationLowCoverageRow[];
  populationQuartiles: {
    populationTopQuartile: number | null;
    investmentPerCapitaBottomQuartile: number | null;
    projectsPer100kBottomQuartile: number | null;
    beneficiaryReachBottomQuartile: number | null;
  };
  dataQuality: SpatialDataQuality;
  notes: string[];
  appliedFilters: Record<string, string | null>;
  role: "SYSTEM_OWNER" | "PARTNER_ADMIN";
}

interface Country {
  code: string;
  name: string;
}
interface Sector {
  key: string;
  name: string;
  color?: string;
}
interface Organization {
  id: string;
  name: string;
}
interface AdministrativeArea {
  id: string;
  name: string;
  type: string | null;
  countryCode: string;
}
interface Donor {
  id: string;
  name: string;
}

// =============================================================================
// Constants
// =============================================================================

// Budget-tier ids must match the server parser in src/lib/project-filters.ts.
const BUDGET_TIERS = [
  { id: "MICRO", label: "Micro (< $50k)" },
  { id: "SMALL", label: "Small ($50k–$500k)" },
  { id: "MEDIUM", label: "Medium ($500k–$2M)" },
  { id: "LARGE", label: "Large (≥ $2M)" },
];

// Supported funding-cliff windows (months). Server also validates this.
const FUNDING_CLIFF_WINDOWS = [
  { id: "6", label: "6 months" },
  { id: "12", label: "12 months" },
  { id: "18", label: "18 months" },
  { id: "24", label: "24 months" },
];
const DEFAULT_FUNDING_CLIFF_WINDOW = "12";

// Spatial-vulnerability palette. Mirrors RISK_TONE shape so the same
// `RiskBadge`-style accessibility rules apply (colour + text always together).
const SPATIAL_TONE: Record<
  SpatialIndicatorLabel,
  { bg: string; border: string; text: string; dot: string; short: string }
> = {
  "Lower recorded spatial vulnerability": {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-800",
    dot: "bg-emerald-500",
    short: "Lower",
  },
  "Moderate recorded spatial vulnerability": {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
    dot: "bg-amber-500",
    short: "Moderate",
  },
  "High recorded spatial vulnerability": {
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-800",
    dot: "bg-orange-500",
    short: "High",
  },
  "Severe recorded spatial vulnerability": {
    bg: "bg-rose-50",
    border: "border-rose-200",
    text: "text-rose-800",
    dot: "bg-rose-500",
    short: "Severe",
  },
};

// Risk-level palette. We also render a text label alongside, so this is
// purely supplementary — never rely on colour alone to convey risk.
const RISK_TONE: Record<RiskLevel, { bg: string; border: string; text: string; dot: string }> = {
  Low: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-800",
    dot: "bg-emerald-500",
  },
  Moderate: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
    dot: "bg-amber-500",
  },
  High: {
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-800",
    dot: "bg-orange-500",
  },
  Severe: {
    bg: "bg-rose-50",
    border: "border-rose-200",
    text: "text-rose-800",
    dot: "bg-rose-500",
  },
  "Insufficient data": {
    bg: "bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-600",
    dot: "bg-slate-400",
  },
};

// Years for the Active During Year filter.
const YEAR_OPTIONS = (() => {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let y = current + 3; y >= current - 10; y--) years.push(y);
  return years;
})();

// Rotating palette used when a series has no assigned colour.
const CHART_PALETTE = [
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
  "#f97316",
  "#6366f1",
  "#ec4899",
  "#84cc16",
];

// =============================================================================
// Formatters
// =============================================================================

function formatCurrencyCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatCurrencyFull(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US");
}

function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

/**
 * Recharts `Formatter` signature widened: Recharts types `value` as
 * `ValueType | undefined` where `ValueType = number | string | Array<...>`.
 * Casting at the call-sites keeps the rest of the file readable.
 */
// biome-ignore lint/suspicious/noExplicitAny: Recharts formatter compatibility
type TooltipFormatter = (v: any, n: any) => [string, string];

const currencyTooltipFormatter =
  (label: string): TooltipFormatter =>
  (v) =>
    [formatCurrencyFull(typeof v === "number" ? v : Number(v)), label];

const numberTooltipFormatter =
  (label: string): TooltipFormatter =>
  (v) =>
    [formatNumber(typeof v === "number" ? v : Number(v)), label];

// =============================================================================
// Small presentational helpers
// =============================================================================

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-[300px] flex items-center justify-center text-slate-500 text-sm text-center px-4">
      {message}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sublabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-600">
          {label}
        </CardTitle>
        <div className="text-slate-500">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        {sublabel && (
          <div className="text-xs text-slate-500 mt-1">{sublabel}</div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * PlaceholderCard renders a visually distinct, clearly-labelled placeholder for
 * widgets scheduled for the next reporting phase. It keeps the information
 * architecture stable so that Prompt 3 can populate each slot without changing
 * the page layout.
 *
 * The card is presentation-only: it does not fetch, compute, or render any
 * data and is announced to assistive technology via `aria-disabled`.
 */
function PlaceholderCard({
  icon,
  title,
  description,
  note = "Planned for next reporting phase.",
  dataDesignId,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  note?: string;
  dataDesignId?: string;
  className?: string;
}) {
  return (
    <Card
      aria-disabled="true"
      data-design-id={dataDesignId}
      className={`border-dashed border-slate-300 bg-slate-50/60 ${
        className ?? ""
      }`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-slate-400 shrink-0">{icon}</div>
            <CardTitle className="text-base text-slate-600 truncate">
              {title}
            </CardTitle>
          </div>
          <Badge
            variant="outline"
            className="bg-white text-slate-500 border-slate-300 whitespace-nowrap"
          >
            <Lock className="w-3 h-3 mr-1" aria-hidden="true" />
            Coming soon
          </Badge>
        </div>
        <CardDescription className="text-slate-500">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[140px] rounded-md border border-dashed border-slate-300 bg-white/70 flex items-center justify-center text-xs text-slate-500 text-center px-4">
          {note}
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Wired report cards (replace earlier "Coming soon" placeholders)
// =============================================================================

/**
 * Geographic Coverage Ratio — real card backed by the spatial vulnerability
 * endpoint's summary. Displayed inside the "Development Coverage" section.
 *
 * Data origin:
 *   - `spatial.summary.geographicCoverageRatio`   (percentage 0..100)
 *   - `spatial.summary.areasWithAnyCoverage`      (covered count)
 *   - `spatial.summary.totalAdministrativeAreas`  (denominator)
 *
 * The card respects the existing Reports filters because the underlying
 * spatial endpoint is filtered by the same state as the rest of the page.
 */
function GeographicCoverageRatioCard({
  spatial,
}: {
  spatial: SpatialVulnerability | null;
}) {
  const summary = spatial?.summary;
  const ratio = summary?.geographicCoverageRatio ?? null;
  const covered = summary?.areasWithAnyCoverage ?? null;
  const total = summary?.totalAdministrativeAreas ?? null;

  return (
    <Card data-design-id="card-geographic-coverage-ratio">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-sky-600 shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <CardTitle className="text-base text-slate-900 truncate">
              Geographic Coverage Ratio
            </CardTitle>
          </div>
        </div>
        <CardDescription className="text-slate-600">
          Proportion of Districts / Counties with at least one active or
          planned project in the current dataset.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {ratio == null || total == null || total === 0 ? (
          <EmptyChart message="Insufficient data: no Districts / Counties available for the current filters." />
        ) : (
          <div className="space-y-3">
            <div className="flex items-baseline gap-3">
              <div
                data-design-id="geo-coverage-ratio-value"
                className="text-3xl font-bold tabular-nums text-slate-900"
              >
                {formatPercent(ratio, 1)}
              </div>
              <div className="text-sm text-slate-600">
                {formatNumber(covered ?? 0)} of {formatNumber(total)} areas
              </div>
            </div>
            <div
              data-design-id="geo-coverage-progress"
              className="h-2 w-full rounded bg-slate-100 overflow-hidden"
              role="presentation"
            >
              <div
                className="h-full bg-sky-500"
                style={{
                  width: `${Math.max(0, Math.min(100, ratio))}%`,
                }}
              />
            </div>
            <p className="text-xs text-slate-500">
              Based on active District / County reference data and recorded
              active or planned projects.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Budget Pipeline by Status — real card driven by the new
 * `budgetPipelineByStatus` field on the development-analytics endpoint.
 * Displays recorded budget and project count per status bucket.
 */
function BudgetPipelineByStatusCard({
  rows,
}: {
  rows: BudgetPipelineRow[] | undefined;
}) {
  // Canonical ordering with friendly labels + colours.
  const ORDER: Array<{ status: string; label: string; color: string }> = [
    { status: "ACTIVE", label: "Active", color: "#0ea5e9" },
    { status: "PLANNED", label: "Planned", color: "#f59e0b" },
    { status: "COMPLETED", label: "Completed", color: "#10b981" },
    { status: "OTHER", label: "Other", color: "#94a3b8" },
  ];

  const byStatus = new Map<string, BudgetPipelineRow>();
  for (const r of rows ?? []) byStatus.set(r.status, r);

  const display = ORDER.flatMap((o) => {
    const r = byStatus.get(o.status);
    if (!r) return [];
    if (o.status === "OTHER" && r.projectCount === 0) return [];
    return [{ ...o, row: r }];
  });

  const total = display.reduce((acc, d) => acc + d.row.recordedBudget, 0);
  const hasAny = display.some((d) => d.row.projectCount > 0);

  return (
    <Card data-design-id="card-budget-pipeline-by-status">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-sky-600 shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <CardTitle className="text-base text-slate-900 truncate">
              Budget Pipeline by Status
            </CardTitle>
          </div>
        </div>
        <CardDescription className="text-slate-600">
          Recorded budget distributed across planned, active, and completed
          projects.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasAny ? (
          <EmptyChart message="No project records with status available for the current filters." />
        ) : (
          <div className="space-y-3">
            {display.map((d) => {
              const widthPct =
                total > 0 ? (d.row.recordedBudget / total) * 100 : 0;
              return (
                <div
                  key={d.status}
                  data-design-id={`pipeline-row-${d.status.toLowerCase()}`}
                  className="space-y-1"
                >
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="inline-block w-2.5 h-2.5 rounded-sm"
                        style={{ backgroundColor: d.color }}
                      />
                      <span className="font-medium text-slate-800">
                        {d.label}
                      </span>
                      <span className="text-xs text-slate-500">
                        · {formatNumber(d.row.projectCount)} project
                        {d.row.projectCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="text-sm tabular-nums text-slate-800 font-medium">
                      {formatCurrencyCompact(d.row.recordedBudget)}
                    </div>
                  </div>
                  <div
                    className="h-2 rounded bg-slate-100 overflow-hidden"
                    role="presentation"
                  >
                    <div
                      className="h-full"
                      style={{
                        width: `${Math.max(0, Math.min(100, widthPct))}%`,
                        backgroundColor: d.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-slate-500">
              Budget pipeline is based on recorded project status and budget
              values.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Donor Dependency — concentration card computed from the existing
 * Budget by Donor distribution.
 *
 * Notes:
 *   - Language is deliberately neutral. Concentration alone does NOT imply
 *     funding risk — the PRD requires that context be stated explicitly.
 *   - The "Unknown / Not Provided" bucket is excluded from the concentration
 *     denominator so that missing donor attribution does not distort shares.
 *     It is reported separately for transparency.
 */
function DonorDependencyCard({
  budgetByDonor,
}: {
  budgetByDonor: Array<{ key: string; name: string; budget: number }>;
}) {
  const unknown = budgetByDonor.find((d) => d.key === "_unknown");
  const attributed = budgetByDonor.filter((d) => d.key !== "_unknown");
  const sortedDesc = [...attributed].sort((a, b) => b.budget - a.budget);
  const attributedTotal = sortedDesc.reduce((acc, d) => acc + d.budget, 0);
  const donorCount = sortedDesc.filter((d) => d.budget > 0).length;

  const shareOfTopN = (n: number): number | null => {
    if (attributedTotal <= 0) return null;
    const sum = sortedDesc
      .slice(0, n)
      .reduce((acc, d) => acc + d.budget, 0);
    return (sum / attributedTotal) * 100;
  };

  const topOne = sortedDesc[0];
  const topOneShare = shareOfTopN(1);
  const topThreeShare = shareOfTopN(3);
  const topFiveShare = shareOfTopN(5);

  const hasAttributed = attributedTotal > 0 && donorCount > 0;

  return (
    <Card data-design-id="card-donor-dependency">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-sky-600 shrink-0">
              <Network className="w-5 h-5" />
            </div>
            <CardTitle className="text-base text-slate-900 truncate">
              Donor Dependency
            </CardTitle>
          </div>
          <Badge
            variant="outline"
            className="bg-slate-50 text-slate-600 border-slate-300 whitespace-nowrap"
          >
            {formatNumber(donorCount)} donors
          </Badge>
        </div>
        <CardDescription className="text-slate-600">
          Concentration of recorded donor budget among the largest donors in
          the current dataset.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasAttributed ? (
          <EmptyChart message="No donor budget data available for the current filters." />
        ) : (
          <div className="space-y-3">
            <div
              className="grid grid-cols-3 gap-2"
              data-design-id="donor-dependency-shares"
            >
              <div className="rounded-md border border-slate-200 p-2.5">
                <div className="text-xs text-slate-500">Top donor</div>
                <div className="text-lg font-bold tabular-nums text-slate-900">
                  {topOneShare != null ? formatPercent(topOneShare, 1) : "—"}
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {topOne?.name ?? "—"}
                </div>
              </div>
              <div className="rounded-md border border-slate-200 p-2.5">
                <div className="text-xs text-slate-500">Top 3</div>
                <div className="text-lg font-bold tabular-nums text-slate-900">
                  {topThreeShare != null
                    ? formatPercent(topThreeShare, 1)
                    : "—"}
                </div>
                <div className="text-[11px] text-slate-500">combined share</div>
              </div>
              <div className="rounded-md border border-slate-200 p-2.5">
                <div className="text-xs text-slate-500">Top 5</div>
                <div className="text-lg font-bold tabular-nums text-slate-900">
                  {topFiveShare != null
                    ? formatPercent(topFiveShare, 1)
                    : "—"}
                </div>
                <div className="text-[11px] text-slate-500">combined share</div>
              </div>
            </div>
            {unknown && unknown.budget > 0 ? (
              <div className="text-xs text-slate-500">
                <span className="font-medium text-slate-600">
                  Unknown / Not Provided:
                </span>{" "}
                {formatCurrencyCompact(unknown.budget)} excluded from
                concentration shares above.
              </div>
            ) : null}
            <p className="text-xs text-slate-500">
              Donor concentration reflects recorded project budgets in the
              current dataset. It does not imply funding risk unless
              interpreted alongside project timelines and replacement funding.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Page
// =============================================================================

export default function ReportsPage() {
  const { user, isSystemOwner } = useAuth();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [cliffs, setCliffs] = useState<FundingCliffs | null>(null);
  const [cliffsLoading, setCliffsLoading] = useState(true);
  const [cliffsError, setCliffsError] = useState<string | null>(null);
  const [spatial, setSpatial] = useState<SpatialVulnerability | null>(null);
  const [spatialLoading, setSpatialLoading] = useState(true);
  const [spatialError, setSpatialError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter reference data.
  const [countries, setCountries] = useState<Country[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [administrativeAreas, setAdministrativeAreas] = useState<
    AdministrativeArea[]
  >([]);
  const [donors, setDonors] = useState<Donor[]>([]);

  // Filter state.
  const [countryCode, setCountryCode] = useState<string>("_all");
  const [sectorKey, setSectorKey] = useState<string>("_all");
  const [status, setStatus] = useState<string>("_all");
  const [organizationId, setOrganizationId] = useState<string>("_all");
  const [administrativeAreaId, setAdministrativeAreaId] =
    useState<string>("_all");
  const [donorId, setDonorId] = useState<string>("_all");
  const [activeDuringYear, setActiveDuringYear] = useState<string>("_all");
  const [budgetTier, setBudgetTier] = useState<string>("_all");
  // Funding-cliff-window affects the Risk & Vulnerability section only.
  // It is stored alongside the other filters so Clear resets it to the
  // default and so Partner Admins see a stable, predictable default.
  const [fundingCliffWindow, setFundingCliffWindow] = useState<string>(
    DEFAULT_FUNDING_CLIFF_WINDOW,
  );

  // Reset district when country changes.
  useEffect(() => {
    setAdministrativeAreaId("_all");
  }, [countryCode]);

  const availableDistricts = useMemo(() => {
    if (countryCode === "_all") return [];
    return administrativeAreas.filter((a) => a.countryCode === countryCode);
  }, [administrativeAreas, countryCode]);

  const buildQuery = useCallback((): string => {
    const q = new URLSearchParams();
    if (countryCode !== "_all") q.set("countryCode", countryCode);
    if (sectorKey !== "_all") q.set("sectorKey", sectorKey);
    if (status !== "_all") q.set("status", status);
    if (organizationId !== "_all") q.set("organizationId", organizationId);
    if (administrativeAreaId !== "_all")
      q.set("administrativeAreaId", administrativeAreaId);
    if (donorId !== "_all") q.set("donorId", donorId);
    if (activeDuringYear !== "_all") q.set("activeDuringYear", activeDuringYear);
    if (budgetTier !== "_all") q.set("budgetTier", budgetTier);
    return q.toString();
  }, [
    countryCode,
    sectorKey,
    status,
    organizationId,
    administrativeAreaId,
    donorId,
    activeDuringYear,
    budgetTier,
  ]);

  // Funding-cliff analytics uses the same global filter set *plus* the
  // funding-cliff-window. Kept separate so the window only influences the
  // Risk & Vulnerability widgets, never the main analytics section.
  const buildCliffQuery = useCallback((): string => {
    const base = buildQuery();
    const q = new URLSearchParams(base);
    q.set("fundingCliffWindow", fundingCliffWindow);
    return q.toString();
  }, [buildQuery, fundingCliffWindow]);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildQuery();
      const res = await fetch(
        `/api/reports/development-analytics${qs ? `?${qs}` : ""}`,
      );
      if (!res.ok) throw new Error("Failed to load analytics");
      const data = await res.json();
      setAnalytics(data);
    } catch {
      setError("Unable to load analytics. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  const fetchCliffs = useCallback(async () => {
    setCliffsLoading(true);
    setCliffsError(null);
    try {
      const qs = buildCliffQuery();
      const res = await fetch(`/api/reports/funding-cliffs?${qs}`);
      if (!res.ok) throw new Error("Failed to load funding cliff analytics");
      const data = await res.json();
      setCliffs(data);
    } catch {
      setCliffsError(
        "Unable to load funding cliff analytics. Please try again.",
      );
    } finally {
      setCliffsLoading(false);
    }
  }, [buildCliffQuery]);

  const fetchSpatial = useCallback(async () => {
    setSpatialLoading(true);
    setSpatialError(null);
    try {
      const qs = buildQuery();
      const res = await fetch(
        `/api/reports/spatial-vulnerability${qs ? `?${qs}` : ""}`,
      );
      if (!res.ok)
        throw new Error("Failed to load spatial vulnerability analytics");
      const data = await res.json();
      setSpatial(data);
    } catch {
      setSpatialError(
        "Unable to load spatial vulnerability analytics. Please try again.",
      );
    } finally {
      setSpatialLoading(false);
    }
  }, [buildQuery]);

  // Load reference data once.
  useEffect(() => {
    (async () => {
      try {
        const [cRes, sRes, oRes, aRes, dRes] = await Promise.all([
          fetch("/api/reference/countries?activeOnly=true"),
          fetch("/api/reference/sectors?activeOnly=true"),
          fetch("/api/organizations?activeOnly=true"),
          fetch("/api/reference/administrative-areas?activeOnly=true"),
          fetch("/api/reference/donors?activeOnly=true"),
        ]);
        const [c, s, o, a, d] = await Promise.all([
          cRes.ok ? cRes.json() : { countries: [] },
          sRes.ok ? sRes.json() : { sectors: [] },
          oRes.ok ? oRes.json() : { organizations: [] },
          aRes.ok ? aRes.json() : { administrativeAreas: [] },
          dRes.ok ? dRes.json() : { donors: [] },
        ]);
        setCountries(c.countries || []);
        setSectors(s.sectors || []);
        setOrganizations(o.organizations || []);
        setAdministrativeAreas(a.administrativeAreas || []);
        setDonors(d.donors || []);
      } catch {
        // Non-fatal: analytics still loads; filters just won't populate.
      }
    })();
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  useEffect(() => {
    fetchCliffs();
  }, [fetchCliffs]);

  useEffect(() => {
    fetchSpatial();
  }, [fetchSpatial]);

  const hasFilters =
    countryCode !== "_all" ||
    sectorKey !== "_all" ||
    status !== "_all" ||
    organizationId !== "_all" ||
    administrativeAreaId !== "_all" ||
    donorId !== "_all" ||
    activeDuringYear !== "_all" ||
    budgetTier !== "_all" ||
    fundingCliffWindow !== DEFAULT_FUNDING_CLIFF_WINDOW;

  const clearFilters = () => {
    setCountryCode("_all");
    setSectorKey("_all");
    setStatus("_all");
    setOrganizationId("_all");
    setAdministrativeAreaId("_all");
    setDonorId("_all");
    setActiveDuringYear("_all");
    setBudgetTier("_all");
    setFundingCliffWindow(DEFAULT_FUNDING_CLIFF_WINDOW);
  };

  return (
    <div data-design-id="reports-page" className="p-6 md:p-8 space-y-6">
      <div data-design-id="reports-header" className="space-y-1">
        <h1
          data-design-id="reports-title"
          className="text-2xl md:text-3xl font-bold text-slate-900"
        >
          Reports &amp; Development Intelligence
        </h1>
        <p data-design-id="reports-subtitle" className="text-slate-600 text-sm">
          {isSystemOwner
            ? "Platform-wide development analytics across all organisations."
            : `Development analytics for ${user?.organization?.name || "your organisation"}.`}
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 1. Filters                                                         */}
      {/* ------------------------------------------------------------------ */}
      <Card data-design-id="reports-filters">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-700 font-medium">
              <Filter className="w-4 h-4" />
              Filters
            </div>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                data-design-id="reports-clear-filters"
              >
                <X className="w-4 h-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="grid gap-1.5">
              <Label>Country</Label>
              <Select value={countryCode} onValueChange={setCountryCode}>
                <SelectTrigger data-design-id="reports-filter-country">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All countries</SelectItem>
                  {countries.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>District / County</Label>
              <Select
                value={administrativeAreaId}
                onValueChange={setAdministrativeAreaId}
                disabled={countryCode === "_all"}
              >
                <SelectTrigger
                  data-design-id="reports-filter-district"
                  title={
                    countryCode === "_all" ? "Select a country first" : undefined
                  }
                >
                  <SelectValue
                    placeholder={
                      countryCode === "_all"
                        ? "Select a country first"
                        : "All Districts / Counties"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Districts / Counties</SelectItem>
                  {availableDistricts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                      {a.type ? ` · ${a.type}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Sector</Label>
              <Select value={sectorKey} onValueChange={setSectorKey}>
                <SelectTrigger data-design-id="reports-filter-sector">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All sectors</SelectItem>
                  {sectors.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger data-design-id="reports-filter-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All statuses</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="PLANNED">Planned</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isSystemOwner && (
              <div className="grid gap-1.5">
                <Label>Implementing Organisation</Label>
                <Select
                  value={organizationId}
                  onValueChange={setOrganizationId}
                >
                  <SelectTrigger data-design-id="reports-filter-organization">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All organisations</SelectItem>
                    {organizations.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label>Donor</Label>
              <Select value={donorId} onValueChange={setDonorId}>
                <SelectTrigger data-design-id="reports-filter-donor">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All donors</SelectItem>
                  {donors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Active During Year</Label>
              <Select
                value={activeDuringYear}
                onValueChange={setActiveDuringYear}
              >
                <SelectTrigger data-design-id="reports-filter-active-year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Any year</SelectItem>
                  {YEAR_OPTIONS.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Budget Tier</Label>
              <Select value={budgetTier} onValueChange={setBudgetTier}>
                <SelectTrigger data-design-id="reports-filter-budget-tier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All budgets</SelectItem>
                  {BUDGET_TIERS.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/*
              Funding Cliff Window — scopes the Risk & Vulnerability section
              only. Default is 12 months; supported values 6 / 12 / 18 / 24.
              The server validates the value and falls back to 12 on
              anything unexpected.
            */}
            <div className="grid gap-1.5">
              <Label htmlFor="reports-filter-funding-cliff-window">
                Funding Cliff Window
              </Label>
              <Select
                value={fundingCliffWindow}
                onValueChange={setFundingCliffWindow}
              >
                <SelectTrigger
                  id="reports-filter-funding-cliff-window"
                  data-design-id="reports-filter-funding-cliff-window"
                  title="Applies to the Risk & Vulnerability section."
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FUNDING_CLIFF_WINDOWS.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {hasFilters && (
            <div className="mt-4">
              <Badge
                variant="outline"
                className="bg-sky-50 text-sky-700 border-sky-200"
              >
                Filters applied
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Neutral, top-of-page note */}
      <div
        data-design-id="reports-data-note"
        className="flex items-start gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2"
      >
        <Info className="w-4 h-4 mt-0.5 text-slate-500 shrink-0" />
        <span>
          Analytics are based only on project records currently available in
          the Development Transparency Map. Missing or incomplete project data
          may affect interpretation.
        </span>
      </div>

      {loading && <LoadingState message="Loading analytics..." />}
      {error && <ErrorState message={error} onRetry={fetchAnalytics} />}

      {!loading && !error && analytics && (
        <>
          {/* -------------------------------------------------------------- */}
          {/* 2. Overview                                                    */}
          {/* -------------------------------------------------------------- */}
          <section
            data-design-id="reports-overview"
            aria-labelledby="reports-overview-heading"
            className="space-y-3"
          >
            <h2
              id="reports-overview-heading"
              className="text-lg font-semibold text-slate-900"
            >
              Overview
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              <SummaryCard
                icon={<FolderOpen className="w-5 h-5" />}
                label="Total Projects"
                value={formatNumber(analytics.summaryCards.totalProjects)}
              />
              <SummaryCard
                icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
                label="Active Projects"
                value={formatNumber(analytics.summaryCards.activeProjects)}
              />
              <SummaryCard
                icon={<Target className="w-5 h-5 text-amber-600" />}
                label="Planned Projects"
                value={formatNumber(analytics.summaryCards.plannedProjects)}
              />
              <SummaryCard
                icon={<FolderOpen className="w-5 h-5 text-slate-500" />}
                label="Completed Projects"
                value={formatNumber(analytics.summaryCards.completedProjects)}
              />
              <SummaryCard
                icon={<DollarSign className="w-5 h-5 text-green-600" />}
                label="Total Recorded Budget"
                value={formatCurrencyCompact(
                  analytics.summaryCards.totalRecordedBudget,
                )}
                sublabel={formatCurrencyFull(
                  analytics.summaryCards.totalRecordedBudget,
                )}
              />
              <SummaryCard
                icon={<Users className="w-5 h-5 text-sky-600" />}
                label="Total Target Beneficiaries"
                value={formatNumber(
                  analytics.summaryCards.totalTargetBeneficiaries,
                )}
              />
              <SummaryCard
                icon={<Building2 className="w-5 h-5" />}
                label="Implementing Organisations"
                value={formatNumber(
                  analytics.summaryCards.implementingOrganizations,
                )}
              />
              <SummaryCard
                icon={<DollarSign className="w-5 h-5" />}
                label="Donors"
                value={formatNumber(analytics.summaryCards.donors)}
              />
              <SummaryCard
                icon={<MapPin className="w-5 h-5" />}
                label="Districts / Counties Covered"
                value={formatNumber(analytics.summaryCards.districtsCovered)}
              />
              <SummaryCard
                icon={<Users className="w-5 h-5" />}
                label="Avg. Cost per Beneficiary"
                value={
                  analytics.summaryCards.avgCostPerBeneficiary != null
                    ? formatCurrencyFull(
                        analytics.summaryCards.avgCostPerBeneficiary,
                      )
                    : "Insufficient data"
                }
                sublabel={
                  analytics.summaryCards.avgCostPerBeneficiary != null
                    ? `Across ${analytics.summaryCards.cpbValidProjectCount} project${analytics.summaryCards.cpbValidProjectCount === 1 ? "" : "s"} with valid data`
                    : "Needs budget and target beneficiaries"
                }
              />
            </div>
          </section>

          {/* -------------------------------------------------------------- */}
          {/* 3. Development Coverage                                        */}
          {/* -------------------------------------------------------------- */}
          <section
            data-design-id="reports-coverage"
            aria-labelledby="reports-coverage-heading"
            className="space-y-3"
          >
            <div className="space-y-1">
              <h2
                id="reports-coverage-heading"
                className="text-lg font-semibold text-slate-900"
              >
                Development Coverage
              </h2>
              <p className="text-sm text-slate-600 max-w-3xl">
                Where development activity is concentrated geographically, by
                sector, and by implementing organisation.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Projects by Sector - donut */}
              <Card data-design-id="chart-projects-by-sector">
                <CardHeader>
                  <CardTitle>Projects by Sector</CardTitle>
                  <CardDescription>
                    Count of projects grouped by sector.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analytics.distribution.projectsBySector.length > 0 ? (
                    <ResponsiveContainer width="100%" height={320}>
                      <PieChart>
                        <Pie
                          data={analytics.distribution.projectsBySector}
                          dataKey="count"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={110}
                          label={({ name, percent }) =>
                            `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`
                          }
                        >
                          {analytics.distribution.projectsBySector.map(
                            (entry, i) => (
                              <Cell
                                key={`sec-${entry.key}`}
                                fill={
                                  entry.color ??
                                  CHART_PALETTE[i % CHART_PALETTE.length]
                                }
                              />
                            ),
                          )}
                        </Pie>
                        <Tooltip
                          formatter={numberTooltipFormatter("Projects")}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart message="No sector data available for the current filters." />
                  )}
                </CardContent>
              </Card>

              {/* Projects by District / County - horizontal bar */}
              <Card data-design-id="chart-projects-by-district">
                <CardHeader>
                  <CardTitle>Projects by District / County</CardTitle>
                  <CardDescription>
                    Count of projects grouped by administrative area.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analytics.distribution.projectsByDistrict.length > 0 ? (
                    <ResponsiveContainer
                      width="100%"
                      height={Math.max(
                        240,
                        Math.min(
                          520,
                          analytics.distribution.projectsByDistrict.length * 30,
                        ),
                      )}
                    >
                      <BarChart
                        data={analytics.distribution.projectsByDistrict.slice(
                          0,
                          15,
                        )}
                        layout="vertical"
                        margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tick={{ fontSize: 12 }} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={160}
                          tick={{ fontSize: 12 }}
                        />
                        <Tooltip
                          formatter={numberTooltipFormatter("Projects")}
                        />
                        <Bar dataKey="count" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart message="No District / County data is available. Assign projects to administrative areas to populate this chart." />
                  )}
                </CardContent>
              </Card>

              {/* Projects by Implementing Organisation - horizontal bar */}
              <Card
                data-design-id="chart-projects-by-org"
                className="lg:col-span-2"
              >
                <CardHeader>
                  <CardTitle>Projects by Implementing Organisation</CardTitle>
                  <CardDescription>
                    Count of projects grouped by implementing organisation.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analytics.distribution.projectsByOrganization.length > 0 ? (
                    <ResponsiveContainer
                      width="100%"
                      height={Math.max(
                        240,
                        Math.min(
                          520,
                          analytics.distribution.projectsByOrganization.length *
                            30,
                        ),
                      )}
                    >
                      <BarChart
                        data={analytics.distribution.projectsByOrganization.slice(
                          0,
                          15,
                        )}
                        layout="vertical"
                        margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tick={{ fontSize: 12 }} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={200}
                          tick={{ fontSize: 12 }}
                        />
                        <Tooltip
                          formatter={numberTooltipFormatter("Projects")}
                        />
                        <Bar
                          dataKey="count"
                          fill="#8b5cf6"
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart message="No organisation data available for the current filters." />
                  )}
                </CardContent>
              </Card>

              {/* Organisation-to-District Matrix */}
              <Card
                data-design-id="matrix-org-district"
                className="lg:col-span-2"
              >
                <CardHeader>
                  <CardTitle>Organisation-to-District Matrix</CardTitle>
                  <CardDescription>
                    Project counts by implementing organisation and District /
                    County.
                    {analytics.organisationDistrictMatrix.note
                      ? ` ${analytics.organisationDistrictMatrix.note}`
                      : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {analytics.organisationDistrictMatrix.rows.length > 0 &&
                  analytics.organisationDistrictMatrix.columns.length > 0 ? (
                    <OrgDistrictMatrixTable
                      matrix={analytics.organisationDistrictMatrix}
                    />
                  ) : (
                    <EmptyChart message="No organisation / District data available for the current filters." />
                  )}
                </CardContent>
              </Card>

              {/* Planned reporting enhancement: Sector Concentration by District / County */}
              <PlaceholderCard
                icon={<Layers className="w-5 h-5" />}
                title="Sector Concentration by District / County"
                description="Share of sector activity concentrated in each District / County."
                dataDesignId="placeholder-sector-concentration"
              />

              {/* Geographic Coverage Ratio — sourced from the spatial
                  vulnerability endpoint's summary so it always stays in
                  sync with the Spatial section further down. */}
              <GeographicCoverageRatioCard spatial={spatial} />
            </div>
          </section>

          {/* -------------------------------------------------------------- */}
          {/* 4. Funding Intelligence                                        */}
          {/* -------------------------------------------------------------- */}
          <section
            data-design-id="reports-funding-intelligence"
            aria-labelledby="reports-funding-heading"
            className="space-y-3"
          >
            <div className="space-y-1">
              <h2
                id="reports-funding-heading"
                className="text-lg font-semibold text-slate-900"
              >
                Funding Intelligence
              </h2>
              <p className="text-sm text-slate-600 max-w-3xl">
                Who is funding what, where funding is concentrated, and whether
                recorded funding appears concentrated among a small number of
                donors.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Budget by Donor - donut + legend */}
              <Card
                data-design-id="chart-budget-by-donor"
                className="lg:col-span-2"
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="w-5 h-5" />
                    Budget by Donor
                  </CardTitle>
                  <CardDescription>
                    Total recorded budget grouped by donor. Projects without a
                    recorded donor are grouped as "Unknown / Not Provided".
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analytics.distribution.budgetByDonor.some(
                    (b) => b.budget > 0,
                  ) ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                      <ResponsiveContainer width="100%" height={320}>
                        <PieChart>
                          <Pie
                            data={analytics.distribution.budgetByDonor}
                            dataKey="budget"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={110}
                          >
                            {analytics.distribution.budgetByDonor.map((e, i) => (
                              <Cell
                                key={`donor-${e.key}`}
                                fill={CHART_PALETTE[i % CHART_PALETTE.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={currencyTooltipFormatter("Budget")}
                          />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-1.5 text-sm">
                        {analytics.distribution.budgetByDonor
                          .slice(0, 10)
                          .map((d, i) => (
                            <div
                              key={d.key}
                              className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1.5"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  aria-hidden="true"
                                  className="inline-block w-3 h-3 rounded-sm shrink-0"
                                  style={{
                                    backgroundColor:
                                      CHART_PALETTE[i % CHART_PALETTE.length],
                                  }}
                                />
                                <span className="truncate text-slate-700">
                                  {d.name}
                                </span>
                              </div>
                              <span className="font-medium text-slate-900 tabular-nums">
                                {formatCurrencyFull(d.budget)}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : (
                    <EmptyChart message="No donor budget data available for the current filters." />
                  )}
                </CardContent>
              </Card>

              {/* Budget by Sector - bar */}
              <Card data-design-id="chart-budget-by-sector">
                <CardHeader>
                  <CardTitle>Budget by Sector</CardTitle>
                  <CardDescription>
                    Total recorded budget grouped by sector.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analytics.distribution.budgetBySector.some(
                    (b) => b.budget > 0,
                  ) ? (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart
                        data={analytics.distribution.budgetBySector}
                        margin={{ top: 10, right: 20, bottom: 50, left: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="name"
                          angle={-30}
                          textAnchor="end"
                          height={70}
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis
                          tickFormatter={(v) => formatCurrencyCompact(v)}
                          tick={{ fontSize: 12 }}
                        />
                        <Tooltip
                          formatter={currencyTooltipFormatter("Budget")}
                        />
                        <Bar dataKey="budget" name="Budget" radius={[4, 4, 0, 0]}>
                          {analytics.distribution.budgetBySector.map(
                            (entry, i) => (
                              <Cell
                                key={`bsec-${entry.key}`}
                                fill={
                                  entry.color ??
                                  CHART_PALETTE[i % CHART_PALETTE.length]
                                }
                              />
                            ),
                          )}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart message="No budget data available for the current filters." />
                  )}
                </CardContent>
              </Card>

              {/* Budget by District / County - horizontal bar */}
              <Card data-design-id="chart-budget-by-district">
                <CardHeader>
                  <CardTitle>Budget by District / County</CardTitle>
                  <CardDescription>
                    Total recorded budget grouped by administrative area.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analytics.distribution.budgetByDistrict.some(
                    (b) => b.budget > 0,
                  ) ? (
                    <ResponsiveContainer
                      width="100%"
                      height={Math.max(
                        240,
                        Math.min(
                          520,
                          analytics.distribution.budgetByDistrict.length * 30,
                        ),
                      )}
                    >
                      <BarChart
                        data={analytics.distribution.budgetByDistrict.slice(
                          0,
                          15,
                        )}
                        layout="vertical"
                        margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          type="number"
                          tickFormatter={(v) => formatCurrencyCompact(v)}
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={160}
                          tick={{ fontSize: 12 }}
                        />
                        <Tooltip
                          formatter={currencyTooltipFormatter("Budget")}
                        />
                        <Bar
                          dataKey="budget"
                          fill="#10b981"
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart message="No District / County budget data is available for the current filters." />
                  )}
                </CardContent>
              </Card>

              {/* Budget by Implementing Organisation */}
              <Card
                data-design-id="chart-budget-by-org"
                className="lg:col-span-2"
              >
                <CardHeader>
                  <CardTitle>Budget by Implementing Organisation</CardTitle>
                  <CardDescription>
                    Total recorded budget grouped by implementing organisation.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analytics.distribution.budgetByOrganization.some(
                    (b) => b.budget > 0,
                  ) ? (
                    <ResponsiveContainer
                      width="100%"
                      height={Math.max(
                        240,
                        Math.min(
                          520,
                          analytics.distribution.budgetByOrganization.length *
                            30,
                        ),
                      )}
                    >
                      <BarChart
                        data={analytics.distribution.budgetByOrganization.slice(
                          0,
                          15,
                        )}
                        layout="vertical"
                        margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          type="number"
                          tickFormatter={(v) => formatCurrencyCompact(v)}
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={200}
                          tick={{ fontSize: 12 }}
                        />
                        <Tooltip
                          formatter={currencyTooltipFormatter("Budget")}
                        />
                        <Bar
                          dataKey="budget"
                          fill="#f59e0b"
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart message="No organisation budget data available for the current filters." />
                  )}
                </CardContent>
              </Card>

              {/* Donor-to-Sector Matrix */}
              <Card
                data-design-id="matrix-donor-sector"
                className="lg:col-span-2"
              >
                <CardHeader>
                  <CardTitle>Donor-to-Sector Matrix</CardTitle>
                  <CardDescription>
                    {analytics.donorSectorMatrix.metric === "budget"
                      ? "Total budget by donor and sector."
                      : "Project count by donor and sector."}
                    {analytics.donorSectorMatrix.note
                      ? ` ${analytics.donorSectorMatrix.note}`
                      : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {analytics.donorSectorMatrix.rows.length > 0 &&
                  analytics.donorSectorMatrix.columns.length > 0 ? (
                    <DonorSectorMatrixTable matrix={analytics.donorSectorMatrix} />
                  ) : (
                    <EmptyChart message="No donor / sector data available for the current filters." />
                  )}
                </CardContent>
              </Card>

              {/* Donor Dependency — concentration of recorded donor
                  budget, derived from distribution.budgetByDonor. */}
              <DonorDependencyCard
                budgetByDonor={analytics.distribution.budgetByDonor}
              />

              {/* Budget Pipeline by Status — recorded budget and project
                  counts per status bucket. */}
              <BudgetPipelineByStatusCard
                rows={analytics.budgetPipelineByStatus}
              />
            </div>
          </section>

          {/* -------------------------------------------------------------- */}
          {/* 5. Efficiency & Reach                                          */}
          {/* -------------------------------------------------------------- */}
          <section
            data-design-id="reports-efficiency-reach"
            aria-labelledby="reports-efficiency-heading"
            className="space-y-3"
          >
            <div className="space-y-1">
              <h2
                id="reports-efficiency-heading"
                className="text-lg font-semibold text-slate-900"
              >
                Efficiency &amp; Reach
              </h2>
              <p className="text-sm text-slate-600 max-w-3xl">
                {analytics.costPerBeneficiary.note}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <CpbCard
                title="Cost per Beneficiary by Sector"
                rows={analytics.costPerBeneficiary.bySector}
                color="#0ea5e9"
              />
              <CpbCard
                title="Cost per Beneficiary by District / County"
                rows={analytics.costPerBeneficiary.byDistrict}
                color="#10b981"
              />
              <CpbCard
                title="Cost per Beneficiary by Donor"
                rows={analytics.costPerBeneficiary.byDonor}
                color="#f59e0b"
              />
            </div>

            {/* Beneficiary Reach vs Budget scatter */}
            <Card data-design-id="chart-scatter">
              <CardHeader>
                <CardTitle>Beneficiary Reach vs Budget</CardTitle>
                <CardDescription>
                  Each dot represents one project with both recorded budget and
                  target beneficiaries. Use this to spot outliers such as
                  high-budget / low-reach records for follow-up review.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {analytics.scatterData.length >= 3 ? (
                  <ResponsiveContainer width="100%" height={420}>
                    <ScatterChart
                      margin={{ top: 10, right: 30, bottom: 30, left: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        type="number"
                        dataKey="budget"
                        name="Budget"
                        tickFormatter={(v) => formatCurrencyCompact(v)}
                        label={{
                          value: "Budget (USD)",
                          position: "insideBottom",
                          offset: -10,
                          fontSize: 12,
                        }}
                      />
                      <YAxis
                        type="number"
                        dataKey="beneficiaries"
                        name="Target Beneficiaries"
                        tickFormatter={(v) =>
                          v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                        }
                        label={{
                          value: "Target Beneficiaries",
                          angle: -90,
                          position: "insideLeft",
                          fontSize: 12,
                        }}
                      />
                      <Tooltip
                        cursor={{ strokeDasharray: "3 3" }}
                        content={<ScatterTooltip />}
                      />
                      <Scatter
                        name="Projects"
                        data={analytics.scatterData}
                        fill="#0ea5e9"
                        fillOpacity={0.75}
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart message="Insufficient data: at least 3 projects with both recorded budget and target beneficiaries are required." />
                )}
              </CardContent>
            </Card>

            {/* Project-level tables merged in from the former Outlier Review
                section so Efficiency & Reach is a single coherent narrative. */}
            <OutlierTable
              title="Highest Cost per Beneficiary Projects"
              description="Top 10 projects ranked by cost per beneficiary. Only projects with both recorded budget and target beneficiaries appear here."
              rows={analytics.outlierTables.highestCostPerBeneficiary}
              showCpb
              emptyMessage="Insufficient data to calculate cost per beneficiary for any project."
            />
            <OutlierTable
              title="Highest Budget Projects"
              description="Top 10 projects ranked by recorded budget."
              rows={analytics.outlierTables.highestBudget}
              emptyMessage="No projects with recorded budget under the current filters."
            />
            <OutlierTable
              title="Largest Beneficiary Reach Projects"
              description="Top 10 projects ranked by target beneficiaries."
              rows={analytics.outlierTables.largestBeneficiaryReach}
              emptyMessage="No projects with target beneficiaries under the current filters."
            />
            <OutlierTable
              title="High-Budget / Lower-Reach Watchlist"
              description={analytics.outlierTables.lowReachHighBudgetNote}
              rows={analytics.outlierTables.lowReachHighBudget}
              emptyMessage="No projects meet the watchlist criteria for the current filters."
              subtle
            />
          </section>

          {/* -------------------------------------------------------------- */}
          {/* 6. Risk & Vulnerability (Funding Cliffs)                       */}
          {/* -------------------------------------------------------------- */}
          <section
            data-design-id="reports-risk-vulnerability"
            aria-labelledby="reports-risk-heading"
            className="space-y-4"
          >
            <div className="space-y-1">
              <h2
                id="reports-risk-heading"
                className="text-lg font-semibold text-slate-900"
              >
                Risk &amp; Vulnerability
              </h2>
              <p className="text-sm text-slate-600 max-w-3xl">
                Funding cliff risk indicates where recorded active funding is
                scheduled to end without equivalent recorded planned
                replacement funding. It does not prove that services will stop
                or that donors have withdrawn. Adjust the Funding Cliff Window
                filter above to change the horizon.
              </p>
            </div>

            {cliffsLoading && (
              <LoadingState message="Loading funding cliff analytics..." />
            )}
            {cliffsError && (
              <ErrorState message={cliffsError} onRetry={fetchCliffs} />
            )}

            {!cliffsLoading && !cliffsError && cliffs && (
              <FundingCliffSection
                cliffs={cliffs}
                fundingCliffWindow={fundingCliffWindow}
              />
            )}

            {/* -------------------------------------------------------- */}
            {/* Spatial Vulnerability & Low Recorded Coverage            */}
            {/* -------------------------------------------------------- */}
            <div
              data-design-id="reports-spatial-vulnerability"
              aria-labelledby="reports-spatial-heading"
              className="pt-4 space-y-4"
            >
              <div className="space-y-1">
                <h3
                  id="reports-spatial-heading"
                  className="text-base font-semibold text-slate-900 flex items-center gap-2"
                >
                  <MapPin className="w-5 h-5 text-slate-500" />
                  Spatial Vulnerability &amp; Low Recorded Coverage
                </h3>
                <p className="text-sm text-slate-600 max-w-3xl">
                  This analysis identifies areas with low or no recorded
                  project coverage within the Development Transparency Map. It
                  does not prove that no development activity exists in those
                  areas.
                </p>
              </div>

              {spatialLoading && (
                <LoadingState message="Loading spatial vulnerability analytics..." />
              )}
              {spatialError && (
                <ErrorState message={spatialError} onRetry={fetchSpatial} />
              )}

              {!spatialLoading && !spatialError && spatial && (
                <SpatialVulnerabilitySection
                  spatial={spatial}
                  countrySelected={countryCode !== "_all"}
                  districtSelected={administrativeAreaId !== "_all"}
                />
              )}
            </div>
          </section>

          {/* -------------------------------------------------------------- */}
          {/* 7. Data Quality                                                */}
          {/* -------------------------------------------------------------- */}
          <section
            data-design-id="reports-data-quality"
            aria-labelledby="reports-data-quality-heading"
            className="space-y-3"
          >
            <h2
              id="reports-data-quality-heading"
              className="text-lg font-semibold text-slate-900"
            >
              Data Quality
            </h2>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <CardTitle>Overall Data Completeness</CardTitle>
                    <CardDescription>
                      Completion percentage across all tracked reporting fields.
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-slate-900">
                      {formatPercent(
                        analytics.dataCompleteness.overallPercent,
                        1,
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      Across {formatNumber(analytics.dataCompleteness.totalProjects)} project
                      {analytics.dataCompleteness.totalProjects === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {analytics.dataCompleteness.warnings.length > 0 && (
                  <div className="space-y-2">
                    {analytics.dataCompleteness.warnings.map((w) => (
                      <div
                        key={w}
                        className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2"
                      >
                        <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                )}

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field</TableHead>
                      <TableHead className="text-right">Complete</TableHead>
                      <TableHead className="text-right">Missing</TableHead>
                      <TableHead className="text-right">Completion %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.dataCompleteness.fields.map((f) => (
                      <TableRow key={f.key}>
                        <TableCell className="font-medium">{f.field}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(f.complete)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(f.missing)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <CompletenessBar percent={f.percent} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* ----------------------------------------------------------- */}
            {/* Spatial data quality notes                                  */}
            {/* ----------------------------------------------------------- */}
            {!spatialLoading && !spatialError && spatial && (
              <Card data-design-id="spatial-data-quality">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-slate-500" />
                    Spatial Data Quality
                  </CardTitle>
                  <CardDescription>
                    Data-completeness signals that affect the Spatial
                    Vulnerability &amp; Low Recorded Coverage widgets above.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <CliffDqCell
                      label="Active admin areas in scope"
                      value={formatNumber(
                        spatial.dataQuality.totalAdministrativeAreas,
                      )}
                    />
                    <CliffDqCell
                      label="Admin areas with no linked projects"
                      value={formatNumber(
                        spatial.dataQuality.administrativeAreasWithNoProjects,
                      )}
                      warn={
                        spatial.dataQuality.administrativeAreasWithNoProjects >
                        0
                      }
                    />
                    <CliffDqCell
                      label="Admin areas excluded (inactive)"
                      value={formatNumber(
                        spatial.dataQuality
                          .administrativeAreasExcludedInactive,
                      )}
                    />
                    <CliffDqCell
                      label="Projects considered"
                      value={formatNumber(
                        spatial.dataQuality.projectsConsidered,
                      )}
                    />
                    <CliffDqCell
                      label="Projects missing District / County"
                      value={formatNumber(
                        spatial.dataQuality.projectsMissingDistrict,
                      )}
                      warn={
                        spatial.dataQuality.projectsMissingDistrict > 0
                      }
                    />
                    <CliffDqCell
                      label="Projects missing budget"
                      value={formatNumber(
                        spatial.dataQuality.projectsMissingBudget,
                      )}
                      warn={spatial.dataQuality.projectsMissingBudget > 0}
                    />
                    <CliffDqCell
                      label="Projects missing beneficiaries"
                      value={formatNumber(
                        spatial.dataQuality.projectsMissingBeneficiaries,
                      )}
                      warn={
                        spatial.dataQuality.projectsMissingBeneficiaries > 0
                      }
                    />
                    <CliffDqCell
                      label="Areas where IPB is not calculable"
                      value={formatNumber(
                        spatial.dataQuality
                          .areasInvestmentPerBeneficiaryUncalculable,
                      )}
                      warn={
                        spatial.dataQuality
                          .areasInvestmentPerBeneficiaryUncalculable > 0
                      }
                    />
                    <CliffDqCell
                      label="Areas with no active/planned projects"
                      value={formatNumber(
                        spatial.dataQuality.areasWithNoActiveOrPlannedProjects,
                      )}
                      warn={
                        spatial.dataQuality.areasWithNoActiveOrPlannedProjects >
                        0
                      }
                    />
                  </div>

                  {/* -------------------------------------------------- */}
                  {/* Part E — Population Data Completeness              */}
                  {/* -------------------------------------------------- */}
                  <div
                    data-design-id="spatial-population-data-quality"
                    className="pt-4 mt-2 border-t border-slate-200 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900">
                          Population Data Completeness
                        </h4>
                        <p className="text-xs text-slate-500 max-w-2xl">
                          Population-weighted metrics depend on estimated
                          population values entered for each District /
                          County. Missing or outdated population estimates
                          may affect interpretation.
                        </p>
                      </div>
                      {spatial.dataQuality.populationCompletenessPercent !==
                        null && (
                        <div className="text-right">
                          <div className="text-2xl font-bold text-slate-900 tabular-nums">
                            {formatPercent(
                              spatial.dataQuality.populationCompletenessPercent,
                              1,
                            )}
                          </div>
                          <div className="text-xs text-slate-500">
                            {formatNumber(
                              spatial.dataQuality.areasWithPopulation,
                            )}{" "}
                            of{" "}
                            {formatNumber(
                              spatial.dataQuality.totalAdministrativeAreas,
                            )}{" "}
                            active areas have population data
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                      <CliffDqCell
                        label="Admin areas with population data"
                        value={formatNumber(
                          spatial.dataQuality.areasWithPopulation,
                        )}
                      />
                      <CliffDqCell
                        label="Admin areas missing population"
                        value={formatNumber(
                          spatial.dataQuality.areasMissingPopulation,
                        )}
                        warn={
                          spatial.dataQuality.areasMissingPopulation > 0
                        }
                      />
                      <CliffDqCell
                        label="Population source completeness"
                        value={
                          spatial.dataQuality
                            .populationSourceCompletenessPercent === null
                            ? "—"
                            : formatPercent(
                                spatial.dataQuality
                                  .populationSourceCompletenessPercent,
                                1,
                              )
                        }
                        warn={
                          (spatial.dataQuality
                            .populationSourceCompletenessPercent ?? 0) < 75
                        }
                      />
                      <CliffDqCell
                        label="Earliest population year"
                        value={
                          spatial.dataQuality.populationYearMin !== null
                            ? String(spatial.dataQuality.populationYearMin)
                            : "—"
                        }
                      />
                      <CliffDqCell
                        label="Latest population year"
                        value={
                          spatial.dataQuality.populationYearMax !== null
                            ? String(spatial.dataQuality.populationYearMax)
                            : "—"
                        }
                      />
                      <CliffDqCell
                        label="Year spread"
                        value={
                          spatial.dataQuality.populationYearSpread !== null
                            ? `${spatial.dataQuality.populationYearSpread} yrs`
                            : "—"
                        }
                        warn={
                          (spatial.dataQuality.populationYearSpread ?? 0) >
                          10
                        }
                      />
                    </div>

                    {spatial.dataQuality.missingPopulationByCountry.length >
                      0 && (
                      <div className="rounded-md border border-slate-200 bg-white">
                        <div className="px-3 py-2 border-b border-slate-200 text-xs font-medium text-slate-600">
                          Missing Population by Country
                        </div>
                        <div className="divide-y divide-slate-100">
                          {spatial.dataQuality.missingPopulationByCountry.map(
                            (e) => (
                              <div
                                key={e.countryCode}
                                className="px-3 py-2 text-xs"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium text-slate-800">
                                    {e.countryName}
                                  </span>
                                  <span className="text-slate-600 tabular-nums">
                                    {e.missingCount} of {e.totalActive}{" "}
                                    missing
                                  </span>
                                </div>
                                {e.missingAreaNames.length > 0 && (
                                  <div className="text-slate-500 mt-0.5 truncate">
                                    {e.missingAreaNames.slice(0, 6).join(", ")}
                                    {e.missingCount > 6
                                      ? `, +${e.missingCount - 6} more`
                                      : ""}
                                  </div>
                                )}
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 pt-2">
                    {spatial.notes.map((n) => (
                      <div
                        key={n}
                        className="flex items-start gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2"
                      >
                        <Info className="w-4 h-4 mt-0.5 text-slate-500 shrink-0" />
                        <span>{n}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function DonorSectorMatrixTable({ matrix }: { matrix: DonorSectorMatrix }) {
  // Build a quick lookup: rowId -> columnKey -> value
  const lookup = new Map<string, { budget: number; count: number }>();
  for (const c of matrix.cells) {
    lookup.set(`${c.rowId}::${c.columnKey}`, {
      budget: c.budget,
      count: c.count,
    });
  }
  const fmtCell = (val: { budget: number; count: number } | undefined) => {
    if (!val || (matrix.metric === "budget" ? val.budget === 0 : val.count === 0))
      return <span className="text-slate-300">—</span>;
    if (matrix.metric === "budget") return formatCurrencyCompact(val.budget);
    return formatNumber(val.count);
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="sticky left-0 bg-white z-10">Donor</TableHead>
          {matrix.columns.map((c) => (
            <TableHead
              key={c.key}
              className="text-right whitespace-nowrap"
            >
              {c.name}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {matrix.rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="sticky left-0 bg-white z-10 font-medium max-w-[220px] truncate">
              {r.name}
            </TableCell>
            {matrix.columns.map((c) => (
              <TableCell
                key={`${r.id}-${c.key}`}
                className="text-right tabular-nums"
              >
                {fmtCell(lookup.get(`${r.id}::${c.key}`))}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function OrgDistrictMatrixTable({ matrix }: { matrix: OrgDistrictMatrix }) {
  const lookup = new Map<string, number>();
  for (const c of matrix.cells) {
    lookup.set(`${c.rowId}::${c.columnId}`, c.count);
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="sticky left-0 bg-white z-10">
            Organisation
          </TableHead>
          {matrix.columns.map((c) => (
            <TableHead
              key={c.id}
              className="text-right whitespace-nowrap"
              title={c.name}
            >
              {c.name}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {matrix.rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="sticky left-0 bg-white z-10 font-medium max-w-[260px] truncate">
              {r.name}
            </TableCell>
            {matrix.columns.map((c) => {
              const v = lookup.get(`${r.id}::${c.id}`);
              return (
                <TableCell
                  key={`${r.id}-${c.id}`}
                  className="text-right tabular-nums"
                >
                  {v && v > 0 ? (
                    v
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function CpbCard({
  title,
  rows,
  color,
}: {
  title: string;
  rows: CpbRow[];
  color: string;
}) {
  const top = rows.slice(0, 10);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {top.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(220, top.length * 28)}>
            <BarChart
              data={top}
              layout="vertical"
              margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"
                tickFormatter={(v) => formatCurrencyCompact(v)}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={130}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={currencyTooltipFormatter("Cost per beneficiary")}
              />
              <Bar dataKey="cpb" fill={color} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[220px] flex items-center justify-center text-slate-500 text-sm text-center px-4">
            Insufficient data
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScatterTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ScatterPoint }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white shadow-lg p-3 text-xs max-w-xs">
      <div className="font-semibold text-slate-900 mb-1 truncate">
        {p.title}
      </div>
      <div className="text-slate-600 space-y-0.5">
        <div>
          <span className="text-slate-500">Sector:</span> {p.sectorName}
        </div>
        {p.districtName && (
          <div>
            <span className="text-slate-500">District / County:</span>{" "}
            {p.districtName}
          </div>
        )}
        <div>
          <span className="text-slate-500">Donor:</span>{" "}
          {p.donorName ?? "Unknown / Not Provided"}
        </div>
        <div>
          <span className="text-slate-500">Organisation:</span>{" "}
          {p.organizationName}
        </div>
        <div>
          <span className="text-slate-500">Budget:</span>{" "}
          {formatCurrencyFull(p.budget)}
        </div>
        <div>
          <span className="text-slate-500">Target Beneficiaries:</span>{" "}
          {formatNumber(p.beneficiaries)}
        </div>
        <div>
          <span className="text-slate-500">CPB:</span>{" "}
          {p.cpb != null ? formatCurrencyFull(p.cpb) : "—"}
        </div>
      </div>
    </div>
  );
}

function OutlierTable({
  title,
  description,
  rows,
  showCpb,
  emptyMessage,
  subtle,
}: {
  title: string;
  description: string;
  rows: OutlierRow[];
  showCpb?: boolean;
  emptyMessage: string;
  subtle?: boolean;
}) {
  return (
    <Card className={subtle ? "border-amber-200" : undefined}>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {subtle && <AlertTriangle className="w-4 h-4 text-amber-600" />}
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {rows.length === 0 ? (
          <EmptyChart message={emptyMessage} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Sector</TableHead>
                <TableHead>District / County</TableHead>
                <TableHead>Donor</TableHead>
                <TableHead>Organisation</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                <TableHead className="text-right">Target Beneficiaries</TableHead>
                {showCpb && <TableHead className="text-right">CPB</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium max-w-[260px] truncate">
                    {r.title}
                  </TableCell>
                  <TableCell>{r.sectorName}</TableCell>
                  <TableCell>{r.districtName ?? "—"}</TableCell>
                  <TableCell>{r.donorName ?? "Unknown / Not Provided"}</TableCell>
                  <TableCell className="max-w-[220px] truncate">
                    {r.organizationName}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.budget != null ? formatCurrencyFull(r.budget) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.beneficiaries != null ? formatNumber(r.beneficiaries) : "—"}
                  </TableCell>
                  {showCpb && (
                    <TableCell className="text-right tabular-nums">
                      {r.cpb != null ? formatCurrencyFull(r.cpb) : "—"}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function CompletenessBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const tone =
    clamped >= 80
      ? "bg-emerald-500"
      : clamped >= 50
        ? "bg-sky-500"
        : clamped >= 30
          ? "bg-amber-500"
          : "bg-rose-500";
  return (
    <div className="flex items-center justify-end gap-2">
      <div
        className="w-28 h-2 bg-slate-100 rounded-full overflow-hidden"
        aria-hidden="true"
      >
        <div
          className={`h-full ${tone}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="w-14 text-right font-medium tabular-nums">
        {formatPercent(clamped, 0)}
      </span>
    </div>
  );
}

// ============================================================================
// Funding Cliff / Risk & Vulnerability widgets
// ============================================================================

/**
 * Badge that communicates risk level using BOTH colour and text.
 * Never rely on colour alone — the text label is always rendered.
 */
function RiskBadge({
  level,
  size = "sm",
}: {
  level: RiskLevel;
  size?: "xs" | "sm";
}) {
  const tone = RISK_TONE[level];
  const padding = size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${padding} ${tone.bg} ${tone.text} ${tone.border}`}
      aria-label={`Risk level: ${level}`}
    >
      <span
        aria-hidden="true"
        className={`inline-block w-1.5 h-1.5 rounded-full ${tone.dot}`}
      />
      {level}
    </span>
  );
}

/**
 * Summary card for the Funding Cliff summary row. Compact, consistent,
 * and dollar-formatted.
 */
function CliffSummaryCard({
  label,
  value,
  sublabel,
  icon,
  accent,
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon: React.ReactNode;
  accent?: "neutral" | "warn" | "danger" | "ok";
}) {
  const accentClass =
    accent === "warn"
      ? "text-amber-700"
      : accent === "danger"
        ? "text-rose-700"
        : accent === "ok"
          ? "text-emerald-700"
          : "text-slate-900";
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-600">
          {label}
        </CardTitle>
        <div className="text-slate-500">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold tabular-nums ${accentClass}`}>
          {value}
        </div>
        {sublabel && (
          <div className="text-xs text-slate-500 mt-1">{sublabel}</div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Tooltip body for cliff-grouping bar charts (By District / By Sector).
 */
function CliffGroupTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: CliffGroupRow }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white shadow-lg p-3 text-xs max-w-xs">
      <div className="font-semibold text-slate-900 mb-1 truncate">{r.name}</div>
      <div className="space-y-0.5 text-slate-600">
        <div>
          <span className="text-slate-500">Cliff risk:</span>{" "}
          <span className="font-medium">
            {r.cliffRiskPercent != null
              ? formatPercent(r.cliffRiskPercent, 1)
              : "Insufficient data"}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Active budget:</span>{" "}
          {formatCurrencyFull(r.activeBudget)}
        </div>
        <div>
          <span className="text-slate-500">Expiring within window:</span>{" "}
          {formatCurrencyFull(r.expiringBudget)}
        </div>
        <div>
          <span className="text-slate-500">Planned replacement:</span>{" "}
          {formatCurrencyFull(r.plannedReplacementBudget)}
        </div>
        <div>
          <span className="text-slate-500">Net exposure:</span>{" "}
          {formatCurrencyFull(r.netExposure)}
        </div>
        <div className="pt-1">
          <RiskBadge level={r.riskLevel} size="xs" />
        </div>
      </div>
    </div>
  );
}

/**
 * Horizontal bar chart showing cliff risk % across a grouping dimension.
 * Each row is shaded by risk tier (plus a text badge alongside).
 */
function CliffGroupBarChart({
  rows,
  groupingLabel,
  limit = 12,
}: {
  rows: CliffGroupRow[];
  groupingLabel: string;
  limit?: number;
}) {
  const top = rows.slice(0, limit);
  if (top.length === 0) {
    return (
      <EmptyChart message={`${groupingLabel} data is required to calculate geographic funding cliff risk.`} />
    );
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(240, top.length * 34)}>
      <BarChart
        data={top.map((r) => ({ ...r, riskPct: r.cliffRiskPercent ?? 0 }))}
        layout="vertical"
        margin={{ top: 5, right: 30, bottom: 5, left: 10 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          type="number"
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={160}
          tick={{ fontSize: 11 }}
        />
        <Tooltip content={<CliffGroupTooltip />} />
        <Bar dataKey="riskPct" radius={[0, 4, 4, 0]}>
          {top.map((r) => {
            const colour =
              r.riskLevel === "Severe"
                ? "#e11d48"
                : r.riskLevel === "High"
                  ? "#ea580c"
                  : r.riskLevel === "Moderate"
                    ? "#d97706"
                    : r.riskLevel === "Low"
                      ? "#059669"
                      : "#94a3b8";
            return <Cell key={`cliff-cell-${r.key}`} fill={colour} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Matrix table for top-10 × top-10 district × sector cells. Each cell shows
 * cliff risk % and a risk badge so the classification is readable without
 * colour alone.
 */
function CliffMatrixTable({ matrix }: { matrix: CliffMatrix }) {
  const lookup = new Map<string, CliffMatrixCell>();
  for (const c of matrix.cells) {
    lookup.set(`${c.districtId}::${c.sectorKey}`, c);
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="sticky left-0 bg-white z-10">
            District / County
          </TableHead>
          {matrix.columns.map((c) => (
            <TableHead
              key={c.id}
              className="text-right whitespace-nowrap"
              title={c.name}
            >
              {c.name}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {matrix.rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="sticky left-0 bg-white z-10 font-medium max-w-[220px] truncate">
              {r.name}
              {r.subLabel && (
                <span className="ml-1 text-[10px] text-slate-400">
                  · {r.subLabel}
                </span>
              )}
            </TableCell>
            {matrix.columns.map((c) => {
              const cell = lookup.get(`${r.id}::${c.id}`);
              if (!cell || cell.activeBudget === 0) {
                return (
                  <TableCell
                    key={`${r.id}-${c.id}`}
                    className="text-right tabular-nums"
                  >
                    <span className="text-slate-300">—</span>
                  </TableCell>
                );
              }
              return (
                <TableCell
                  key={`${r.id}-${c.id}`}
                  className="text-right tabular-nums"
                  title={`Active ${formatCurrencyFull(cell.activeBudget)} · Expiring ${formatCurrencyFull(cell.expiringBudget)} · Planned ${formatCurrencyFull(cell.plannedReplacementBudget)}`}
                >
                  <div className="inline-flex flex-col items-end gap-0.5">
                    <span className="font-medium">
                      {cell.cliffRiskPercent != null
                        ? formatPercent(cell.cliffRiskPercent, 0)
                        : "—"}
                    </span>
                    <RiskBadge level={cell.riskLevel} size="xs" />
                  </div>
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Main Risk & Vulnerability body, rendered once funding-cliffs data loads.
 */
function FundingCliffSection({
  cliffs,
  fundingCliffWindow,
}: {
  cliffs: FundingCliffs;
  fundingCliffWindow: string;
}) {
  const windowLabel = `${fundingCliffWindow} months`;
  const s = cliffs.summary;

  return (
    <div className="space-y-6">
      {/* 1. Funding Cliff Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <CliffSummaryCard
          label="Funding Cliff Window"
          value={windowLabel}
          sublabel={`Calculated ${new Date(cliffs.calculatedAt).toLocaleDateString()}`}
          icon={<CalendarClock className="w-5 h-5" />}
        />
        <CliffSummaryCard
          label="Total Active Budget"
          value={formatCurrencyCompact(s.activeBudget)}
          sublabel={`${formatNumber(s.activeProjectCount)} project${s.activeProjectCount === 1 ? "" : "s"}`}
          icon={<DollarSign className="w-5 h-5 text-emerald-600" />}
          accent="ok"
        />
        <CliffSummaryCard
          label="Budget Expiring Within Window"
          value={formatCurrencyCompact(s.expiringBudget)}
          sublabel={`${formatNumber(s.expiringProjectCount)} active project${s.expiringProjectCount === 1 ? "" : "s"}`}
          icon={<TrendingDown className="w-5 h-5 text-amber-600" />}
          accent="warn"
        />
        <CliffSummaryCard
          label="Planned Replacement Budget"
          value={formatCurrencyCompact(s.plannedReplacementBudget)}
          sublabel={`${formatNumber(s.plannedReplacementProjectCount)} planned project${s.plannedReplacementProjectCount === 1 ? "" : "s"}`}
          icon={<TrendingUp className="w-5 h-5 text-sky-600" />}
        />
        <CliffSummaryCard
          label="Net Funding Exposure"
          value={formatCurrencyCompact(s.netExposure)}
          sublabel="Expiring minus planned replacement"
          icon={<ShieldAlert className="w-5 h-5 text-rose-600" />}
          accent={s.netExposure > 0 ? "danger" : "neutral"}
        />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">
              Overall Cliff Risk
            </CardTitle>
            <div className="text-slate-500">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-slate-900">
              {s.cliffRiskPercent != null
                ? formatPercent(s.cliffRiskPercent, 1)
                : "Insufficient data"}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              <RiskBadge level={s.riskLevel} size="xs" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 2. By District / County */}
      <Card data-design-id="cliff-by-district">
        <CardHeader>
          <CardTitle>Funding Cliff Risk by District / County</CardTitle>
          <CardDescription>
            Districts / Counties ranked by projected cliff risk over the
            selected {windowLabel} horizon. Risk is classified Low (≤25%),
            Moderate (≤50%), High (≤75%), or Severe (&gt;75%).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CliffGroupBarChart
            rows={cliffs.byDistrict}
            groupingLabel="District / County"
          />
          {cliffs.byDistrict.length > 0 && (
            <CliffGroupTable rows={cliffs.byDistrict} groupLabel="District / County" />
          )}
        </CardContent>
      </Card>

      {/* 3. By Sector */}
      <Card data-design-id="cliff-by-sector">
        <CardHeader>
          <CardTitle>Funding Cliff Risk by Sector</CardTitle>
          <CardDescription>
            Sectors ranked by projected cliff risk over the selected{" "}
            {windowLabel} horizon.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CliffGroupBarChart
            rows={cliffs.bySector}
            groupingLabel="Sector"
          />
          {cliffs.bySector.length > 0 && (
            <CliffGroupTable rows={cliffs.bySector} groupLabel="Sector" />
          )}
        </CardContent>
      </Card>

      {/* 4. District × Sector Matrix */}
      <Card data-design-id="cliff-matrix">
        <CardHeader>
          <CardTitle>District-Sector Funding Cliff Matrix</CardTitle>
          <CardDescription>
            Cliff risk % by District / County (rows) and Sector (columns).
            {cliffs.districtSectorMatrix.note
              ? ` ${cliffs.districtSectorMatrix.note}`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {cliffs.districtSectorMatrix.rows.length > 0 &&
          cliffs.districtSectorMatrix.columns.length > 0 ? (
            <CliffMatrixTable matrix={cliffs.districtSectorMatrix} />
          ) : (
            <EmptyChart message="District / County data is required to calculate the district-sector funding cliff matrix." />
          )}
        </CardContent>
      </Card>

      {/* 5. Projects Ending Soon */}
      <Card data-design-id="cliff-projects-ending-soon">
        <CardHeader>
          <CardTitle>Projects Ending Soon</CardTitle>
          <CardDescription>
            Active projects with a recorded end date inside the selected{" "}
            {windowLabel} horizon, sorted by soonest end date first. Up to 50
            projects shown.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {cliffs.projectsEndingSoon.length === 0 ? (
            <EmptyChart message="No active projects are currently scheduled to end within the selected window." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project Title</TableHead>
                  <TableHead>District / County</TableHead>
                  <TableHead>Sector</TableHead>
                  <TableHead>Donor</TableHead>
                  <TableHead>Implementing Organisation</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead className="text-right">Days Until End</TableHead>
                  <TableHead className="text-right">Budget (USD)</TableHead>
                  <TableHead className="text-right">
                    Target Beneficiaries
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cliffs.projectsEndingSoon.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium max-w-[240px] truncate">
                      {p.title}
                    </TableCell>
                    <TableCell>{p.districtName ?? "—"}</TableCell>
                    <TableCell>{p.sectorName}</TableCell>
                    <TableCell>
                      {p.donorName ?? "Unknown / Not Provided"}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate">
                      {p.organizationName}
                    </TableCell>
                    <TableCell>
                      {p.endDate
                        ? new Date(p.endDate).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.daysUntilEnd != null
                        ? formatNumber(p.daysUntilEnd)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.budgetUsd != null
                        ? formatCurrencyFull(p.budgetUsd)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.targetBeneficiaries != null
                        ? formatNumber(p.targetBeneficiaries)
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 6. Top Funding Cliff Alerts (>50%) */}
      <Card data-design-id="cliff-top-alerts" className="border-rose-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-600" />
            Top Funding Cliff Alerts
          </CardTitle>
          <CardDescription>
            District-sector combinations where projected cliff risk exceeds
            50% over the selected {windowLabel} horizon. Use this as a
            review list, not a final funding forecast.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {cliffs.topAlerts.length === 0 ? (
            <EmptyChart message="No high funding cliff alerts under the current filters." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Geography / District</TableHead>
                  <TableHead>Sector</TableHead>
                  <TableHead className="text-right">Active Budget</TableHead>
                  <TableHead className="text-right">Expiring Budget</TableHead>
                  <TableHead className="text-right">
                    Planned Replacement
                  </TableHead>
                  <TableHead className="text-right">Net Exposure</TableHead>
                  <TableHead className="text-right">Cliff Risk %</TableHead>
                  <TableHead>Risk Level</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cliffs.topAlerts.map((a) => (
                  <TableRow key={`${a.districtId}-${a.sectorKey}`}>
                    <TableCell className="font-medium">
                      {a.districtName}
                      {a.districtType && (
                        <span className="ml-1 text-[10px] text-slate-400">
                          · {a.districtType}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{a.sectorName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrencyFull(a.activeBudget)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrencyFull(a.expiringBudget)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrencyFull(a.plannedReplacementBudget)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatCurrencyFull(a.netExposure)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {a.cliffRiskPercent != null
                        ? formatPercent(a.cliffRiskPercent, 1)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <RiskBadge level={a.riskLevel} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 7. Donor Exit Exposure */}
      <Card data-design-id="cliff-donor-exit-exposure">
        <CardHeader>
          <CardTitle>Donor Exit Exposure</CardTitle>
          <CardDescription>
            Recorded projects funded by each donor ending within the selected{" "}
            {windowLabel} horizon. This is not evidence that a donor has
            withdrawn — it reflects scheduled project end dates only.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {cliffs.donorExitExposure.length === 0 ? (
            <EmptyChart message="No donor data is available for the current filters." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Donor</TableHead>
                  <TableHead className="text-right">Active Budget</TableHead>
                  <TableHead className="text-right">Expiring Budget</TableHead>
                  <TableHead className="text-right">
                    Expiring Share %
                  </TableHead>
                  <TableHead className="text-right">Active Projects</TableHead>
                  <TableHead className="text-right">
                    Ending Within Window
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cliffs.donorExitExposure.map((d) => (
                  <TableRow key={d.donorName}>
                    <TableCell className="font-medium max-w-[220px] truncate">
                      {d.donorName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrencyFull(d.activeBudget)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrencyFull(d.expiringBudget)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {d.expiringSharePercent != null
                        ? formatPercent(d.expiringSharePercent, 1)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(d.activeProjectCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(d.expiringProjectCount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 8. Funding Pipeline Timeline */}
      <Card data-design-id="cliff-timeline">
        <CardHeader>
          <CardTitle>Funding Pipeline Timeline</CardTitle>
          <CardDescription>
            Active budget scheduled to end (amber) versus planned budget
            scheduled to start (blue) in each six-month bucket across the next
            24 months. Projects with missing budgets or invalid dates are
            excluded. Use this to see whether the planned pipeline appears to
            replace expiring funding.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cliffs.timeline.every(
            (b) => b.expiringBudget === 0 && b.plannedBudget === 0,
          ) ? (
            <EmptyChart message="No active project end dates or planned project start dates fall within the next 24 months." />
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={cliffs.timeline}
                margin={{ top: 10, right: 20, bottom: 10, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis
                  tickFormatter={(v) => formatCurrencyCompact(v)}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  formatter={(v: unknown, name: unknown) => [
                    formatCurrencyFull(
                      typeof v === "number" ? v : Number(v),
                    ),
                    String(name),
                  ]}
                />
                <Legend />
                <Bar
                  dataKey="expiringBudget"
                  name="Expiring (active projects)"
                  fill="#f59e0b"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="plannedBudget"
                  name="Planned (starting)"
                  fill="#0ea5e9"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 9. Funding Cliff Data Quality + standing note */}
      <Card data-design-id="cliff-data-quality">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5 text-slate-500" />
            Funding Cliff Data Quality
          </CardTitle>
          <CardDescription>
            Records excluded from the calculations above, for transparency.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <CliffDqCell
              label="Projects evaluated"
              value={formatNumber(cliffs.dataQuality.totalProjects)}
            />
            <CliffDqCell
              label="Completed (excluded)"
              value={formatNumber(cliffs.dataQuality.completedExcluded)}
            />
            <CliffDqCell
              label="Eligible active projects"
              value={formatNumber(cliffs.dataQuality.eligibleActiveCount)}
            />
            <CliffDqCell
              label="Missing budget"
              value={formatNumber(cliffs.dataQuality.missingBudgetCount)}
              warn={cliffs.dataQuality.missingBudgetCount > 0}
            />
            <CliffDqCell
              label="Missing or invalid dates"
              value={formatNumber(cliffs.dataQuality.missingOrInvalidDatesCount)}
              warn={cliffs.dataQuality.missingOrInvalidDatesCount > 0}
            />
            <CliffDqCell
              label="Active projects missing end date"
              value={formatNumber(cliffs.dataQuality.activeMissingEndDateCount)}
              warn={cliffs.dataQuality.activeMissingEndDateCount > 0}
            />
            <CliffDqCell
              label="Missing District / County"
              value={formatNumber(cliffs.dataQuality.missingDistrictCount)}
              warn={cliffs.dataQuality.missingDistrictCount > 0}
            />
            <CliffDqCell
              label="Missing donor"
              value={formatNumber(cliffs.dataQuality.missingDonorCount)}
              warn={cliffs.dataQuality.missingDonorCount > 0}
            />
            <CliffDqCell
              label="Planned replacement projects"
              value={formatNumber(cliffs.dataQuality.eligiblePlannedCount)}
            />
          </div>
          <div className="space-y-2 pt-2">
            {cliffs.notes.map((n) => (
              <div
                key={n}
                className="flex items-start gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2"
              >
                <Info className="w-4 h-4 mt-0.5 text-slate-500 shrink-0" />
                <span>{n}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CliffDqCell({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        warn
          ? "bg-amber-50 border-amber-200 text-amber-900"
          : "bg-slate-50 border-slate-200 text-slate-700"
      }`}
    >
      <div className="text-[11px] uppercase tracking-wide opacity-70">
        {label}
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/**
 * Compact, filter-responsive table beneath each cliff bar chart so exact
 * figures are always visible. Kept separate from the chart so both can be
 * hidden independently under loading / empty states.
 */
function CliffGroupTable({
  rows,
  groupLabel,
}: {
  rows: CliffGroupRow[];
  groupLabel: string;
}) {
  return (
    <div className="overflow-x-auto mt-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{groupLabel}</TableHead>
            <TableHead className="text-right">Active Budget</TableHead>
            <TableHead className="text-right">Expiring Budget</TableHead>
            <TableHead className="text-right">Planned Replacement</TableHead>
            <TableHead className="text-right">Net Exposure</TableHead>
            <TableHead className="text-right">Cliff Risk %</TableHead>
            <TableHead>Risk Level</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key}>
              <TableCell className="font-medium max-w-[240px] truncate">
                {r.name}
                {r.subLabel && (
                  <span className="ml-1 text-[10px] text-slate-400">
                    · {r.subLabel}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrencyFull(r.activeBudget)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrencyFull(r.expiringBudget)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrencyFull(r.plannedReplacementBudget)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrencyFull(r.netExposure)}
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {r.cliffRiskPercent != null
                  ? formatPercent(r.cliffRiskPercent, 1)
                  : "—"}
              </TableCell>
              <TableCell>
                <RiskBadge level={r.riskLevel} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
// ============================================================================
// Spatial Vulnerability / Low-Coverage widgets
// ============================================================================

/**
 * Badge for the Spatial Vulnerability Indicator score. Uses both colour and
 * text so we never rely on colour alone to convey risk.
 */
function SpatialBadge({
  label,
  score,
  size = "sm",
}: {
  label: SpatialIndicatorLabel;
  score?: number;
  size?: "xs" | "sm";
}) {
  const tone = SPATIAL_TONE[label];
  const padding =
    size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${padding} ${tone.bg} ${tone.text} ${tone.border}`}
      aria-label={`Spatial vulnerability: ${label}${
        score !== undefined ? ` (score ${score})` : ""
      }`}
      title={label}
    >
      <span
        aria-hidden="true"
        className={`inline-block w-1.5 h-1.5 rounded-full ${tone.dot}`}
      />
      {tone.short}
      {score !== undefined && (
        <span className="ml-1 tabular-nums text-slate-500">· {score}</span>
      )}
    </span>
  );
}

/**
 * Summary cards for the spatial-vulnerability block.
 */
function SpatialSummaryCards({ summary }: { summary: SpatialSummary }) {
  const lowestIpb = summary.lowestInvestmentPerBeneficiary;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <CliffSummaryCard
        label="Active Admin Areas in Scope"
        value={formatNumber(summary.totalAdministrativeAreas)}
        sublabel="Universe from active District / County reference list"
        icon={<Globe className="w-5 h-5" />}
      />
      <CliffSummaryCard
        label="Areas with Active Projects"
        value={formatNumber(summary.areasWithActiveProjects)}
        sublabel={`${formatNumber(summary.areasWithAnyCoverage)} with active or planned`}
        icon={<MapPin className="w-5 h-5 text-emerald-600" />}
        accent="ok"
      />
      <CliffSummaryCard
        label="Areas with Planned Projects"
        value={formatNumber(summary.areasWithPlannedProjects)}
        sublabel="Per Planned-intervention definition"
        icon={<Sprout className="w-5 h-5 text-sky-600" />}
      />
      <CliffSummaryCard
        label="No Recorded Active or Planned"
        value={formatNumber(summary.areasWithNoActiveOrPlannedProjects)}
        sublabel="Areas without current recorded coverage"
        icon={<ShieldAlert className="w-5 h-5 text-rose-600" />}
        accent={
          summary.areasWithNoActiveOrPlannedProjects > 0 ? "danger" : "neutral"
        }
      />
      <CliffSummaryCard
        label="Recorded Geographic Coverage Ratio"
        value={
          summary.geographicCoverageRatio != null
            ? formatPercent(summary.geographicCoverageRatio, 1)
            : "—"
        }
        sublabel="Areas with any active/planned ÷ total"
        icon={<Target className="w-5 h-5" />}
      />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-slate-600">
            Lowest Recorded Investment / Beneficiary
          </CardTitle>
          <div className="text-slate-500">
            <DollarSign className="w-5 h-5" />
          </div>
        </CardHeader>
        <CardContent>
          {lowestIpb ? (
            <>
              <div className="text-2xl font-bold tabular-nums text-slate-900">
                {formatCurrencyCompact(lowestIpb.investmentPerBeneficiary)}
              </div>
              <div className="text-xs text-slate-500 mt-1 truncate">
                {lowestIpb.areaName}
                {lowestIpb.areaType ? ` · ${lowestIpb.areaType}` : ""}
                <span className="text-slate-400">
                  {" "}
                  · {lowestIpb.countryName}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-slate-500">
                Insufficient data
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Requires budget and beneficiaries &gt; 0 at area level
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Table of administrative areas that currently have no recorded active or
 * planned interventions.
 */
function NoCoverageTable({
  rows,
  districtSelected,
}: {
  rows: NoCoverageRow[];
  districtSelected: boolean;
}) {
  if (rows.length === 0) {
    return (
      <EmptyChart
        message={
          districtSelected
            ? "The selected District / County has at least one active or planned recorded project."
            : "Every active District / County in scope has at least one active or planned recorded project."
        }
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Country</TableHead>
            <TableHead>District / County</TableHead>
            <TableHead>Admin Area Type</TableHead>
            <TableHead className="text-right">Active Projects</TableHead>
            <TableHead className="text-right">Planned Projects</TableHead>
            <TableHead className="text-right">Completed Projects</TableHead>
            <TableHead>Last Recorded Project End Date</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.areaId}>
              <TableCell>{r.countryName}</TableCell>
              <TableCell className="font-medium">{r.areaName}</TableCell>
              <TableCell className="text-slate-600">
                {r.areaType ?? "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(r.activeCount)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(r.plannedCount)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(r.completedCount)}
              </TableCell>
              <TableCell>
                {r.lastRecordedEndDate
                  ? new Date(r.lastRecordedEndDate).toLocaleDateString()
                  : "—"}
              </TableCell>
              <TableCell className="text-slate-600 text-xs max-w-[280px]">
                {r.note}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Low-coverage-by-area ranked table + horizontal bar chart of active counts.
 */
function LowCoverageByArea({ rows }: { rows: LowCoverageRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyChart message="No recorded projects under the current filters." />
    );
  }
  const chartRows = rows.slice(0, 15);
  return (
    <div className="space-y-4">
      <ResponsiveContainer
        width="100%"
        height={Math.max(260, chartRows.length * 30)}
      >
        <BarChart
          data={chartRows.map((r) => ({
            name: `${r.areaName}${r.countryName ? ` · ${r.countryName}` : ""}`,
            active: r.activeCount,
            planned: r.plannedCount,
          }))}
          layout="vertical"
          margin={{ top: 5, right: 30, bottom: 5, left: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="name"
            width={200}
            tick={{ fontSize: 11 }}
          />
          <Tooltip />
          <Legend />
          <Bar
            dataKey="active"
            stackId="coverage"
            name="Active"
            fill="#059669"
          />
          <Bar
            dataKey="planned"
            stackId="coverage"
            name="Planned"
            fill="#0ea5e9"
          />
        </BarChart>
      </ResponsiveContainer>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Country</TableHead>
              <TableHead>District / County</TableHead>
              <TableHead className="text-right">Active</TableHead>
              <TableHead className="text-right">Planned</TableHead>
              <TableHead className="text-right">Recorded Budget</TableHead>
              <TableHead className="text-right">Target Beneficiaries</TableHead>
              <TableHead className="text-right">
                Investment / Beneficiary
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.areaId}>
                <TableCell>{r.countryName}</TableCell>
                <TableCell className="font-medium max-w-[240px] truncate">
                  {r.areaName}
                  {r.areaType && (
                    <span className="ml-1 text-[10px] text-slate-400">
                      · {r.areaType}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(r.activeCount)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(r.plannedCount)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.totalBudget > 0
                    ? formatCurrencyFull(r.totalBudget)
                    : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.totalBeneficiaries > 0
                    ? formatNumber(r.totalBeneficiaries)
                    : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.investmentPerBeneficiary != null
                    ? formatCurrencyFull(r.investmentPerBeneficiary)
                    : (
                      <span className="text-slate-500">Insufficient data</span>
                    )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/**
 * Investment-per-beneficiary chart — only rows where the ratio is calculable.
 */
function IpbByArea({ rows }: { rows: IpbRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyChart message="Insufficient data: no areas have both recorded budget and target beneficiaries greater than zero." />
    );
  }
  const top = rows.slice(0, 15);
  return (
    <div className="space-y-4">
      <ResponsiveContainer
        width="100%"
        height={Math.max(260, top.length * 30)}
      >
        <BarChart
          data={top.map((r) => ({
            name: `${r.areaName} · ${r.countryName}`,
            ipb: r.investmentPerBeneficiary,
          }))}
          layout="vertical"
          margin={{ top: 5, right: 30, bottom: 5, left: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            type="number"
            tickFormatter={(v) => formatCurrencyCompact(v)}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={200}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            formatter={currencyTooltipFormatter("Investment / beneficiary")}
          />
          <Bar dataKey="ipb" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Country</TableHead>
              <TableHead>District / County</TableHead>
              <TableHead className="text-right">Active</TableHead>
              <TableHead className="text-right">Planned</TableHead>
              <TableHead className="text-right">Recorded Budget</TableHead>
              <TableHead className="text-right">Target Beneficiaries</TableHead>
              <TableHead className="text-right">
                Investment / Beneficiary
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.areaId}>
                <TableCell>{r.countryName}</TableCell>
                <TableCell className="font-medium max-w-[240px] truncate">
                  {r.areaName}
                  {r.areaType && (
                    <span className="ml-1 text-[10px] text-slate-400">
                      · {r.areaType}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(r.activeCount)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(r.plannedCount)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrencyFull(r.totalBudget)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(r.totalBeneficiaries)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatCurrencyFull(r.investmentPerBeneficiary)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/**
 * Sector coverage matrix (area rows × sector columns). Each cell shows
 * active+planned counts plus a text label tier (None / Low / Recorded) so
 * the classification survives any colourblind or grayscale rendering.
 */
function SectorCoverageMatrixTable({
  matrix,
}: {
  matrix: SectorCoverageMatrix;
}) {
  const lookup = new Map<string, SectorCoverageCell>();
  for (const c of matrix.cells) {
    lookup.set(`${c.areaId}::${c.sectorKey}`, c);
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-white z-10">
              District / County
            </TableHead>
            {matrix.columns.map((c) => (
              <TableHead
                key={c.key}
                className="text-center whitespace-nowrap"
                title={c.name}
              >
                {c.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {matrix.rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="sticky left-0 bg-white z-10 font-medium max-w-[220px] truncate">
                {r.name}
                {r.subLabel && (
                  <span className="ml-1 text-[10px] text-slate-400">
                    · {r.subLabel}
                  </span>
                )}
              </TableCell>
              {matrix.columns.map((c) => {
                const cell = lookup.get(`${r.id}::${c.key}`);
                const total = cell?.total ?? 0;
                let tier: "None" | "Low" | "Recorded" = "None";
                let cls = "bg-slate-50 text-slate-500 border-slate-200";
                if (total === 0) {
                  tier = "None";
                } else if (total <= 2) {
                  tier = "Low";
                  cls = "bg-amber-50 text-amber-800 border-amber-200";
                } else {
                  tier = "Recorded";
                  cls = "bg-emerald-50 text-emerald-800 border-emerald-200";
                }
                return (
                  <TableCell
                    key={`${r.id}-${c.key}`}
                    className="text-center tabular-nums"
                  >
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}
                      title={`${total} recorded active/planned (${
                        cell?.active ?? 0
                      } active, ${cell?.planned ?? 0} planned)`}
                      aria-label={`${c.name}: ${tier}, ${total} active or planned`}
                    >
                      <span className="tabular-nums">{total}</span>
                      <span className="opacity-70">· {tier}</span>
                    </span>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Watchlist of potentially under-served areas. Reasons are surfaced as chips
 * (not a black-box score) and the spatial-vulnerability indicator is shown
 * alongside so reviewers can see both the score and its contributing rules.
 */
function UnderservedWatchlist({ rows }: { rows: WatchlistRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyChart message="No areas currently meet any of the watchlist rules under the selected filters." />
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Country</TableHead>
            <TableHead>District / County</TableHead>
            <TableHead>Reason for Flag</TableHead>
            <TableHead className="text-right">Active</TableHead>
            <TableHead className="text-right">Planned</TableHead>
            <TableHead className="text-right">Recorded Budget</TableHead>
            <TableHead className="text-right">Target Beneficiaries</TableHead>
            <TableHead className="text-right">
              Investment / Beneficiary
            </TableHead>
            <TableHead>Data Completeness Note</TableHead>
            <TableHead>Vulnerability Indicator</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.areaId}>
              <TableCell>{r.countryName}</TableCell>
              <TableCell className="font-medium max-w-[200px] truncate">
                {r.areaName}
                {r.areaType && (
                  <span className="ml-1 text-[10px] text-slate-400">
                    · {r.areaType}
                  </span>
                )}
              </TableCell>
              <TableCell className="max-w-[260px]">
                <div className="flex flex-wrap gap-1">
                  {r.reasons.map((reason) => (
                    <span
                      key={reason}
                      className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700"
                    >
                      {reason}
                    </span>
                  ))}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(r.activeCount)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(r.plannedCount)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.totalBudget > 0 ? formatCurrencyFull(r.totalBudget) : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.totalBeneficiaries > 0
                  ? formatNumber(r.totalBeneficiaries)
                  : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.investmentPerBeneficiary != null
                  ? formatCurrencyFull(r.investmentPerBeneficiary)
                  : <span className="text-slate-500">Insufficient data</span>}
              </TableCell>
              <TableCell className="text-xs text-slate-600 max-w-[220px]">
                {r.completenessNote}
              </TableCell>
              <TableCell>
                <SpatialBadge
                  label={r.spatialVulnerabilityLabel}
                  score={r.spatialVulnerabilityScore}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Spatial Vulnerability Indicator table — distilled from the watchlist to
 * show just score + contributing factors. Labelled clearly as a ranking
 * signal, not a definitive finding.
 */
// ---------------------------------------------------------------------------
// Population-weighted tables (Prompt 7 · Part F).
// ---------------------------------------------------------------------------

/**
 * Shared renderer for a PwrCell (value | "Population data missing" |
 * "Insufficient budget data" | …). Keeps wording identical across every
 * population-weighted table so the PRD language contract is enforced.
 */
function PwrValue({
  cell,
  format,
}: {
  cell: PwrCell;
  format: (n: number) => string;
}) {
  if (cell.value !== null) {
    return <span className="tabular-nums">{format(cell.value)}</span>;
  }
  return (
    <span className="text-xs text-slate-500" title={cell.label ?? undefined}>
      {cell.label ?? "Insufficient data"}
    </span>
  );
}

function PopulationCell({
  pop,
  year,
}: {
  pop: number | null;
  year: number | null;
}) {
  if (pop === null || pop === undefined) {
    return <span className="text-xs text-slate-500">Population data missing</span>;
  }
  return (
    <span className="tabular-nums">
      {formatNumber(pop)}
      {year !== null && (
        <span className="ml-1 text-[10px] text-slate-400">({year})</span>
      )}
    </span>
  );
}

function InvestmentPerCapitaTable({
  rows,
}: {
  rows: InvestmentPerCapitaRow[];
}) {
  if (rows.length === 0) {
    return (
      <EmptyChart message="No districts / counties in scope for per-capita analysis." />
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Country</TableHead>
            <TableHead>District / County</TableHead>
            <TableHead className="text-right">Estimated Population</TableHead>
            <TableHead className="text-right">Recorded Budget</TableHead>
            <TableHead className="text-right">
              Recorded Investment per Capita
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.areaId}>
              <TableCell>{r.countryName}</TableCell>
              <TableCell className="font-medium max-w-[220px] truncate">
                {r.areaName}
                {r.areaType && (
                  <span className="ml-1 text-[10px] text-slate-400">
                    · {r.areaType}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <PopulationCell
                  pop={r.estimatedPopulation}
                  year={r.populationYear}
                />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.totalBudget > 0 ? (
                  formatCurrencyCompact(r.totalBudget)
                ) : (
                  <span className="text-xs text-slate-500">
                    Insufficient budget data
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <PwrValue cell={r.investmentPerCapita} format={formatCurrencyFull} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ProjectsPer100kTable({ rows }: { rows: ProjectsPer100kRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyChart message="No districts / counties in scope for projects-per-100k analysis." />
    );
  }
  const fmt = (n: number) =>
    n >= 100 ? formatNumber(Math.round(n)) : n.toFixed(2);
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Country</TableHead>
            <TableHead>District / County</TableHead>
            <TableHead className="text-right">Estimated Population</TableHead>
            <TableHead className="text-right">Active + Planned</TableHead>
            <TableHead className="text-right">Projects / 100k</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.areaId}>
              <TableCell>{r.countryName}</TableCell>
              <TableCell className="font-medium max-w-[220px] truncate">
                {r.areaName}
                {r.areaType && (
                  <span className="ml-1 text-[10px] text-slate-400">
                    · {r.areaType}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <PopulationCell
                  pop={r.estimatedPopulation}
                  year={r.populationYear}
                />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(r.activeOrPlannedCount)}
              </TableCell>
              <TableCell className="text-right">
                <PwrValue cell={r.projectsPer100k} format={fmt} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function BeneficiaryReachTable({ rows }: { rows: BeneficiaryReachRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyChart message="No districts / counties in scope for beneficiary reach analysis." />
    );
  }
  const fmt = (n: number) => `${n.toFixed(1)}%`;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Country</TableHead>
            <TableHead>District / County</TableHead>
            <TableHead className="text-right">Estimated Population</TableHead>
            <TableHead className="text-right">Target Beneficiaries</TableHead>
            <TableHead className="text-right">Reach %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.areaId}>
              <TableCell>{r.countryName}</TableCell>
              <TableCell className="font-medium max-w-[220px] truncate">
                {r.areaName}
                {r.areaType && (
                  <span className="ml-1 text-[10px] text-slate-400">
                    · {r.areaType}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <PopulationCell
                  pop={r.estimatedPopulation}
                  year={r.populationYear}
                />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.totalBeneficiaries > 0 ? (
                  formatNumber(r.totalBeneficiaries)
                ) : (
                  <span className="text-xs text-slate-500">
                    Insufficient beneficiary data
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <PwrValue cell={r.beneficiaryReachPercent} format={fmt} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function HighPopulationLowCoverageWatchlistTable({
  rows,
}: {
  rows: HighPopulationLowCoverageRow[];
}) {
  if (rows.length === 0) {
    return (
      <EmptyChart message="No districts / counties meet the high-population / low-recorded-coverage criteria under the current filters." />
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Country</TableHead>
            <TableHead>District / County</TableHead>
            <TableHead className="text-right">Estimated Population</TableHead>
            <TableHead className="text-right">Active</TableHead>
            <TableHead className="text-right">Planned</TableHead>
            <TableHead className="text-right">Recorded Budget</TableHead>
            <TableHead className="text-right">Investment / Capita</TableHead>
            <TableHead className="text-right">Projects / 100k</TableHead>
            <TableHead className="text-right">Reach %</TableHead>
            <TableHead>Reason for Flag</TableHead>
            <TableHead>Data Completeness</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.areaId}>
              <TableCell>{r.countryName}</TableCell>
              <TableCell className="font-medium max-w-[220px] truncate">
                {r.areaName}
                {r.areaType && (
                  <span className="ml-1 text-[10px] text-slate-400">
                    · {r.areaType}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <PopulationCell
                  pop={r.estimatedPopulation}
                  year={r.populationYear}
                />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.activeCount}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.plannedCount}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.totalBudget > 0
                  ? formatCurrencyCompact(r.totalBudget)
                  : "—"}
              </TableCell>
              <TableCell className="text-right">
                <PwrValue
                  cell={r.investmentPerCapita}
                  format={formatCurrencyFull}
                />
              </TableCell>
              <TableCell className="text-right">
                <PwrValue
                  cell={r.projectsPer100k}
                  format={(n) =>
                    n >= 100 ? formatNumber(Math.round(n)) : n.toFixed(2)
                  }
                />
              </TableCell>
              <TableCell className="text-right">
                <PwrValue
                  cell={r.beneficiaryReachPercent}
                  format={(n) => `${n.toFixed(1)}%`}
                />
              </TableCell>
              <TableCell className="max-w-[320px]">
                <div className="flex flex-wrap gap-1">
                  {r.reasons.map((reason) => (
                    <span
                      key={reason}
                      className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800"
                    >
                      {reason}
                    </span>
                  ))}
                </div>
              </TableCell>
              <TableCell className="max-w-[200px] text-xs text-slate-600">
                {r.dataCompletenessNote}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SpatialIndicatorTable({ rows }: { rows: SpatialIndicatorRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyChart message="No areas flagged under the spatial vulnerability indicator for the current filters." />
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Country</TableHead>
            <TableHead>District / County</TableHead>
            <TableHead className="text-right">Score (0–100)</TableHead>
            <TableHead>Classification</TableHead>
            <TableHead>Contributing Factors</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.areaId}>
              <TableCell>{r.countryName}</TableCell>
              <TableCell className="font-medium max-w-[220px] truncate">
                {r.areaName}
                {r.areaType && (
                  <span className="ml-1 text-[10px] text-slate-400">
                    · {r.areaType}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {r.score}
              </TableCell>
              <TableCell>
                <SpatialBadge label={r.label} />
              </TableCell>
              <TableCell className="max-w-[360px]">
                <div className="flex flex-wrap gap-1">
                  {r.contributingFactors.map((f) => (
                    <span
                      key={f}
                      className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Main Spatial Vulnerability body, rendered once data loads. Organised as a
 * stack of cards so each widget can individually empty-state.
 */
function SpatialVulnerabilitySection({
  spatial,
  countrySelected,
  districtSelected,
}: {
  spatial: SpatialVulnerability;
  countrySelected: boolean;
  districtSelected: boolean;
}) {
  return (
    <div className="space-y-6">
      {/* 1. Summary cards */}
      <SpatialSummaryCards summary={spatial.summary} />

      <div className="flex items-start gap-2 text-xs text-slate-600 bg-sky-50 border border-sky-200 rounded-md px-3 py-2">
        <Info className="w-4 h-4 mt-0.5 text-sky-600 shrink-0" />
        <span>
          This indicator is based only on records currently available in the
          Development Transparency Map and should be interpreted as a
          prioritisation signal, not a definitive finding.
        </span>
      </div>

      {/* 2. No recorded active or planned */}
      <Card data-design-id="spatial-no-coverage">
        <CardHeader>
          <CardTitle>
            Districts / Counties with No Recorded Active or Planned Interventions
          </CardTitle>
          <CardDescription>
            Active administrative areas from the reference list that have no
            recorded active or planned project under the current filters. This
            cross-references the District / County reference table against
            project records, so zero-project areas are visible.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NoCoverageTable
            rows={spatial.noRecordedActiveOrPlanned}
            districtSelected={districtSelected}
          />
        </CardContent>
      </Card>

      {/* 3. Low recorded coverage by area */}
      <Card data-design-id="spatial-low-coverage">
        <CardHeader>
          <CardTitle>Low Recorded Coverage by District / County</CardTitle>
          <CardDescription>
            Active districts / counties ranked by fewest active projects first,
            then by smallest recorded budget. Includes areas with zero
            recorded projects.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LowCoverageByArea rows={spatial.lowCoverageByArea} />
        </CardContent>
      </Card>

      {/* 4. Investment per beneficiary */}
      <Card data-design-id="spatial-ipb">
        <CardHeader>
          <CardTitle>
            Investment per Beneficiary by District / County
          </CardTitle>
          <CardDescription>
            Calculated only for areas where recorded budget and target
            beneficiaries are both greater than zero. Areas where the ratio
            cannot be calculated are shown as "Insufficient data", not zero.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IpbByArea rows={spatial.investmentPerBeneficiaryByArea} />
        </CardContent>
      </Card>

      {/* 5. Sector coverage matrix */}
      <Card data-design-id="spatial-sector-coverage">
        <CardHeader>
          <CardTitle>Sector Coverage by District / County</CardTitle>
          <CardDescription>
            Matrix of active-or-planned project counts per District / County
            (rows) and Sector (columns). Tier labels: "None" (0 recorded),
            "Low" (1–2 recorded), "Recorded" (3+).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {spatial.sectorCoverageMatrix ? (
            <>
              <SectorCoverageMatrixTable
                matrix={spatial.sectorCoverageMatrix}
              />
              {spatial.sectorCoverageMatrix.note && (
                <p className="text-xs text-slate-500 mt-2">
                  {spatial.sectorCoverageMatrix.note}
                </p>
              )}
            </>
          ) : (
            <EmptyChart
              message={
                countrySelected
                  ? "No sector data found for the current filters."
                  : "Select a country to view sector coverage by district / county."
              }
            />
          )}
        </CardContent>
      </Card>

      {/* 6. Watchlist */}
      <Card
        data-design-id="spatial-underserved-watchlist"
        className="border-amber-200"
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
            Potentially Underserved Districts Watchlist
          </CardTitle>
          <CardDescription>
            Areas flagged by one or more transparent rules: no recorded active
            or planned projects, bottom quartile by active project count,
            bottom quartile by recorded budget, or bottom quartile by
            investment per beneficiary. Reasons are listed per row rather than
            combined into a single opaque score.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UnderservedWatchlist rows={spatial.underservedWatchlist} />
        </CardContent>
      </Card>

      {/* 7. Spatial vulnerability indicator (optional — Part D) */}
      <Card data-design-id="spatial-vulnerability-indicator">
        <CardHeader>
          <CardTitle>Spatial Vulnerability Indicator</CardTitle>
          <CardDescription>
            Transparent additive score (0–100) derived from: no active or
            planned projects (+40), bottom quartile by active project count
            (+20), bottom quartile by recorded budget (+20), bottom quartile
            by investment per beneficiary (+10), majority of records missing
            key data (+10). Use as a ranking signal only — not a definitive
            finding.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SpatialIndicatorTable rows={spatial.spatialVulnerabilityIndicator} />
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Part F — Population-adjusted spatial metrics                       */}
      {/* ------------------------------------------------------------------ */}
      <div
        data-design-id="spatial-population-adjusted"
        className="pt-2 space-y-1"
      >
        <h4 className="text-sm font-semibold text-slate-900">
          Population-adjusted metrics
        </h4>
        <div className="flex items-start gap-2 text-xs text-slate-600 bg-sky-50 border border-sky-200 rounded-md px-3 py-2">
          <Info className="w-4 h-4 mt-0.5 text-sky-600 shrink-0" />
          <span>
            Population-adjusted metrics compare recorded project data
            against estimated District / County population values entered
            in the platform. They do not prove need, deprivation, or
            underfunding on their own.
          </span>
        </div>
      </div>

      {/* F.1 — Recorded Investment per Capita */}
      <Card data-design-id="spatial-investment-per-capita">
        <CardHeader>
          <CardTitle>Recorded Investment per Capita by District / County</CardTitle>
          <CardDescription>
            Recorded budget (active + planned, in USD) divided by the
            estimated population for each area. Areas without an estimated
            population show "Population data missing"; areas without a
            recorded budget show "Insufficient budget data". Missing values
            are never treated as zero for ranking.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InvestmentPerCapitaTable
            rows={spatial.investmentPerCapitaByArea}
          />
        </CardContent>
      </Card>

      {/* F.2 — Recorded Projects per 100,000 People */}
      <Card data-design-id="spatial-projects-per-100k">
        <CardHeader>
          <CardTitle>Recorded Projects per 100,000 People</CardTitle>
          <CardDescription>
            Count of active + planned projects per 100,000 estimated
            residents. Useful for comparing recorded project density across
            large and small areas. Areas without an estimated population
            show "Population data missing".
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectsPer100kTable rows={spatial.projectsPer100kByArea} />
        </CardContent>
      </Card>

      {/* F.3 — Recorded Beneficiary Reach as % of Estimated Population */}
      <Card data-design-id="spatial-beneficiary-reach">
        <CardHeader>
          <CardTitle>
            Recorded Beneficiary Reach as % of Estimated Population
          </CardTitle>
          <CardDescription>
            Total target beneficiaries (active + planned) expressed as a
            percentage of estimated population. Values above 100% may occur
            where projects report repeated service contacts, overlapping
            beneficiary groups, or broad programme targets.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BeneficiaryReachTable rows={spatial.beneficiaryReachByArea} />
          {spatial.beneficiaryReachHasOver100 && (
            <div className="mt-3 flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              <Info className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
              <span>
                Recorded beneficiary reach may exceed 100% where projects
                report repeated service contacts, overlapping beneficiary
                groups, or broad programme targets.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* F.4 — High Population / Low Recorded Coverage Watchlist */}
      <Card
        data-design-id="spatial-high-pop-low-coverage-watchlist"
        className="border-amber-200"
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
            High Population / Low Recorded Coverage Watchlist
          </CardTitle>
          <CardDescription>
            Districts / counties flagged by one or more transparent rules:
            top-quartile population with no recorded active or planned
            projects; top-quartile population with bottom-quartile
            investment per capita or projects per 100,000; or recorded
            population with bottom-quartile beneficiary reach. This list
            complements the Potentially Underserved Districts Watchlist —
            it does not replace it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HighPopulationLowCoverageWatchlistTable
            rows={spatial.highPopulationLowCoverageWatchlist}
          />
        </CardContent>
      </Card>

      {/* 8. Map view placeholder — kept explicit so the roadmap is visible. */}
      <Card
        aria-disabled="true"
        data-design-id="spatial-map-placeholder"
        className="border-dashed border-slate-300 bg-slate-50/60"
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin className="w-5 h-5 text-slate-400 shrink-0" />
              <CardTitle className="text-base text-slate-600 truncate">
                District shading / heatmap
              </CardTitle>
            </div>
            <Badge
              variant="outline"
              className="bg-white text-slate-500 border-slate-300 whitespace-nowrap"
            >
              <Lock className="w-3 h-3 mr-1" aria-hidden="true" />
              Planned
            </Badge>
          </div>
          <CardDescription className="text-slate-500">
            District shading / heatmap planned for future phase pending
            boundary data. No external boundary datasets are fetched in this
            release.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
