"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  projectsByStatus: Array<{
    status: string;
    count: number;
  }>;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "#10b981",
  PLANNED: "#f59e0b",
  COMPLETED: "#6b7280",
};

export default function ReportsPage() {
  const { user, isSystemOwner } = useAuth();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analytics");
      if (!res.ok) throw new Error("Failed to load analytics");
      const data = await res.json();
      setAnalytics(data);
    } catch (err) {
      setError("Unable to load analytics. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  return (
    <div data-design-id="reports-page" className="p-8">
      <div
        data-design-id="reports-header"
        className="mb-6"
      >
        <h1
          data-design-id="reports-title"
          className="text-2xl font-bold text-slate-900"
        >
          Reports & Analytics
        </h1>
        <p
          data-design-id="reports-subtitle"
          className="text-slate-600"
        >
          {isSystemOwner ? "Platform-wide analytics" : `Analytics for ${user?.organization?.name || "your organization"}`}
        </p>
      </div>

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
                <CardDescription>Current project status distribution</CardDescription>
              </CardHeader>
              <CardContent>
                {analytics.projectsByStatus.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={analytics.projectsByStatus}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="status" />
                      <YAxis />
                      <Tooltip />
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
              <CardDescription>Top 10 countries by project count</CardDescription>
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
        </>
      )}
    </div>
  );
}