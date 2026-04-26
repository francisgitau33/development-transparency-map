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
  DollarSign,
  Filter,
  FolderOpen,
  Globe,
  Info,
  MapPin,
  Target,
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

interface Analytics {
  summaryCards: SummaryCards;
  distribution: Distribution;
  donorSectorMatrix: DonorSectorMatrix;
  organisationDistrictMatrix: OrgDistrictMatrix;
  costPerBeneficiary: CostPerBeneficiary;
  scatterData: ScatterPoint[];
  outlierTables: OutlierTables;
  dataCompleteness: DataCompleteness;
  appliedFilters: Record<string, string | null>;
  dataNotes: string[];
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

// =============================================================================
// Page
// =============================================================================

export default function ReportsPage() {
  const { user, isSystemOwner } = useAuth();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
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

  const hasFilters =
    countryCode !== "_all" ||
    sectorKey !== "_all" ||
    status !== "_all" ||
    organizationId !== "_all" ||
    administrativeAreaId !== "_all" ||
    donorId !== "_all" ||
    activeDuringYear !== "_all" ||
    budgetTier !== "_all";

  const clearFilters = () => {
    setCountryCode("_all");
    setSectorKey("_all");
    setStatus("_all");
    setOrganizationId("_all");
    setAdministrativeAreaId("_all");
    setDonorId("_all");
    setActiveDuringYear("_all");
    setBudgetTier("_all");
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
          {/* 3. Development Distribution                                    */}
          {/* -------------------------------------------------------------- */}
          <section
            data-design-id="reports-distribution"
            aria-labelledby="reports-distribution-heading"
            className="space-y-3"
          >
            <h2
              id="reports-distribution-heading"
              className="text-lg font-semibold text-slate-900"
            >
              Development Distribution
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 1. Projects by Sector - donut */}
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

              {/* 2. Budget by Sector - bar */}
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

              {/* 3. Projects by District - horizontal bar */}
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

              {/* 4. Budget by District - horizontal bar */}
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

              {/* 5. Projects by Organisation */}
              <Card data-design-id="chart-projects-by-org">
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
                          width={180}
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

              {/* 6. Budget by Organisation */}
              <Card data-design-id="chart-budget-by-org">
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
                          width={180}
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

              {/* 7. Budget by Donor - donut */}
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
            </div>
          </section>

          {/* -------------------------------------------------------------- */}
          {/* 4. Donor & Actor Intelligence                                  */}
          {/* -------------------------------------------------------------- */}
          <section
            data-design-id="reports-actor-intelligence"
            aria-labelledby="reports-actor-heading"
            className="space-y-3"
          >
            <h2
              id="reports-actor-heading"
              className="text-lg font-semibold text-slate-900"
            >
              Donor &amp; Actor Intelligence
            </h2>

            {/* Donor-to-Sector matrix */}
            <Card data-design-id="matrix-donor-sector">
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

            {/* Organisation-to-District matrix */}
            <Card data-design-id="matrix-org-district">
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
          </section>

          {/* -------------------------------------------------------------- */}
          {/* 5. Cost Effectiveness & Reach                                  */}
          {/* -------------------------------------------------------------- */}
          <section
            data-design-id="reports-cost-effectiveness"
            aria-labelledby="reports-cpb-heading"
            className="space-y-3"
          >
            <h2
              id="reports-cpb-heading"
              className="text-lg font-semibold text-slate-900"
            >
              Cost Effectiveness &amp; Reach
            </h2>
            <p className="text-xs text-slate-500 max-w-3xl">
              {analytics.costPerBeneficiary.note}
            </p>

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

            {/* Scatter */}
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
          </section>

          {/* -------------------------------------------------------------- */}
          {/* 6. Outlier Review                                              */}
          {/* -------------------------------------------------------------- */}
          <section
            data-design-id="reports-outliers"
            aria-labelledby="reports-outliers-heading"
            className="space-y-3"
          >
            <h2
              id="reports-outliers-heading"
              className="text-lg font-semibold text-slate-900"
            >
              Outlier Review
            </h2>

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
          {/* 7. Data Completeness                                           */}
          {/* -------------------------------------------------------------- */}
          <section
            data-design-id="reports-completeness"
            aria-labelledby="reports-completeness-heading"
            className="space-y-3"
          >
            <h2
              id="reports-completeness-heading"
              className="text-lg font-semibold text-slate-900"
            >
              Data Completeness
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