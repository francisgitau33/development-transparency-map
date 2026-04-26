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
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { useAuth } from "@/lib/auth-context";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  DollarSign,
  FolderOpen,
  Building2,
  Globe,
  Filter,
  X,
} from "lucide-react";

interface Analytics {
  summary: {
    totalProjects: number;
    totalOrganizations: number;
    totalBudget: number;
    activeProjects: number;
    plannedProjects: number;
    completedProjects: number;
  };
  projectsByCountry: Array<{
    countryCode: string;
    countryName: string;
    count: number;
  }>;
  projectsBySector: Array<{
    sectorKey: string;
    sectorName: string;
    color: string;
    count: number;
  }>;
  projectsByStatus: Array<{ status: string; count: number }>;
}

interface Country {
  code: string;
  name: string;
}
interface Sector {
  key: string;
  name: string;
  icon?: string;
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

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "#10b981",
  PLANNED: "#f59e0b",
  COMPLETED: "#6b7280",
};

// Budget-tier ids must match the server parser in src/lib/project-filters.ts.
const BUDGET_TIERS = [
  { id: "MICRO", label: "Micro (< $50k)" },
  { id: "SMALL", label: "Small ($50k–$500k)" },
  { id: "MEDIUM", label: "Medium ($500k–$2M)" },
  { id: "LARGE", label: "Large (≥ $2M)" },
];

// Years for the Active During Year filter. Range covers common project spans.
const YEAR_OPTIONS = (() => {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let y = current + 3; y >= current - 10; y--) years.push(y);
  return years;
})();

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
      const res = await fetch(`/api/analytics${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to load analytics");
      const data = await res.json();
      setAnalytics(data);
    } catch (err) {
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

  const formatCurrency = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    return `$${value.toFixed(0)}`;
  };

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
    <div data-design-id="reports-page" className="p-8">
      <div data-design-id="reports-header" className="mb-6">
        <h1
          data-design-id="reports-title"
          className="text-2xl font-bold text-slate-900"
        >
          Reports & Analytics
        </h1>
        <p data-design-id="reports-subtitle" className="text-slate-600">
          {isSystemOwner
            ? "Platform-wide analytics"
            : `Analytics for ${user?.organization?.name || "your organization"}`}
        </p>
      </div>

      <Card data-design-id="reports-filters" className="mb-6">
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
                    countryCode === "_all"
                      ? "Select a country first"
                      : undefined
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
        </CardContent>
      </Card>

      {loading && <LoadingState message="Loading analytics..." />}
      {error && <ErrorState message={error} onRetry={fetchAnalytics} />}

      {!loading && !error && analytics && (
        <>
          <div
            data-design-id="reports-summary"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
          >
            <Card data-design-id="summary-projects">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">
                  Total Projects
                </CardTitle>
                <FolderOpen className="w-5 h-5 text-sky-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900">
                  {analytics.summary.totalProjects}
                </div>
              </CardContent>
            </Card>

            {isSystemOwner && (
              <Card data-design-id="summary-orgs">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-slate-600">
                    Organizations
                  </CardTitle>
                  <Building2 className="w-5 h-5 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-slate-900">
                    {analytics.summary.totalOrganizations}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card data-design-id="summary-budget">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">
                  Total Budget
                </CardTitle>
                <DollarSign className="w-5 h-5 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900">
                  {formatCurrency(analytics.summary.totalBudget)}
                </div>
              </CardContent>
            </Card>

            <Card data-design-id="summary-active">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">
                  Active Projects
                </CardTitle>
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900">
                  {analytics.summary.activeProjects}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <Card data-design-id="chart-sector">
              <CardHeader>
                <CardTitle>Projects by Sector</CardTitle>
                <CardDescription>Distribution across sectors</CardDescription>
              </CardHeader>
              <CardContent>
                {analytics.projectsBySector.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={analytics.projectsBySector}
                        dataKey="count"
                        nameKey="sectorName"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, percent }) =>
                          `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`
                        }
                      >
                        {analytics.projectsBySector.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-slate-500">
                    No sector data available
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-design-id="chart-status">
              <CardHeader>
                <CardTitle>Projects by Status</CardTitle>
                <CardDescription>
                  Current project status distribution
                </CardDescription>
              </CardHeader>
              <CardContent>
                {analytics.projectsByStatus.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={analytics.projectsByStatus}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="status" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="count" name="Projects">
                        {analytics.projectsByStatus.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={STATUS_COLORS[entry.status] || "#888"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-slate-500">
                    No status data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card data-design-id="chart-country">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Globe className="w-5 h-5 mr-2" />
                Projects by Country
              </CardTitle>
              <CardDescription>
                Top 10 countries by project count
              </CardDescription>
            </CardHeader>
            <CardContent>
              {analytics.projectsByCountry.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={analytics.projectsByCountry} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="countryName" type="category" width={150} />
                    <Tooltip />
                    <Bar dataKey="count" name="Projects" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[400px] flex items-center justify-center text-slate-500">
                  No country data available
                </div>
              )}
            </CardContent>
          </Card>

          {hasFilters && (
            <div className="mt-4 text-xs text-slate-500">
              <Badge variant="outline" className="bg-sky-50 text-sky-700">
                Filters applied
              </Badge>
            </div>
          )}
        </>
      )}
    </div>
  );
}