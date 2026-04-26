"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { useAuth } from "@/lib/auth-context";
import { BRANDING } from "@/lib/branding";
import {
  FolderOpen,
  Building2,
  TrendingUp,
  DollarSign,
  Plus,
  ArrowRight,
  Clock,
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
  recentProjects: Array<{
    id: string;
    title: string;
    organizationName: string;
    status: string;
    createdAt: string;
  }>;
}

export default function DashboardPage() {
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
      setError("Unable to load dashboard data. Please try again.");
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div data-design-id="dashboard-page" className="p-8">
      <div
        data-design-id="dashboard-header"
        className="mb-8"
      >
        <h1
          data-design-id="dashboard-title"
          className="text-2xl font-bold text-slate-900"
        >
          Welcome back{user?.displayName ? `, ${user.displayName}` : ""}
        </h1>
        <p
          data-design-id="dashboard-subtitle"
          className="text-slate-600 mt-1"
        >
          {BRANDING.productName} Dashboard
          {user?.organization && (
            <span> • {user.organization.name}</span>
          )}
        </p>
      </div>

      {loading && <LoadingState message="Loading dashboard..." />}

      {error && <ErrorState message={error} onRetry={fetchAnalytics} />}

      {!loading && !error && analytics && (
        <>
          <div
            data-design-id="dashboard-stats"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
          >
            <Card data-design-id="stat-card-projects">
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
                <div className="flex gap-2 mt-2">
                  <Badge variant="outline" className="bg-sky-50 text-sky-700">
                    {analytics.summary.activeProjects} Active
                  </Badge>
                  <Badge variant="outline" className="bg-amber-50 text-amber-700">
                    {analytics.summary.plannedProjects} Planned
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {isSystemOwner && (
              <Card data-design-id="stat-card-orgs">
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
                  <p className="text-sm text-slate-500 mt-2">Active partners</p>
                </CardContent>
              </Card>
            )}

            <Card data-design-id="stat-card-budget">
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
                <p className="text-sm text-slate-500 mt-2">Across all projects</p>
              </CardContent>
            </Card>

            <Card data-design-id="stat-card-completed">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">
                  Completed
                </CardTitle>
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900">
                  {analytics.summary.completedProjects}
                </div>
                <p className="text-sm text-slate-500 mt-2">Projects delivered</p>
              </CardContent>
            </Card>
          </div>

          <div
            data-design-id="dashboard-content"
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            <Card
              data-design-id="recent-projects-card"
              className="lg:col-span-2"
            >
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Recent Projects</CardTitle>
                  <CardDescription>Latest project activity</CardDescription>
                </div>
                <Link href="/dashboard/projects">
                  <Button variant="outline" size="sm">
                    View All <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {analytics.recentProjects.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No projects yet</p>
                    <Link href="/dashboard/projects">
                      <Button variant="link" className="mt-2">
                        <Plus className="w-4 h-4 mr-1" />
                        Create your first project
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {analytics.recentProjects.map((project) => (
                      <div
                        key={project.id}
                        data-design-id={`recent-project-${project.id}`}
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                      >
                        <div>
                          <h4 className="font-medium text-slate-900">
                            {project.title}
                          </h4>
                          <p className="text-sm text-slate-500">
                            {project.organizationName}
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge
                            variant="outline"
                            className={
                              project.status === "ACTIVE"
                                ? "bg-sky-50 text-sky-700"
                                : project.status === "PLANNED"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-slate-50 text-slate-700"
                            }
                          >
                            {project.status}
                          </Badge>
                          <p className="text-xs text-slate-400 mt-1 flex items-center justify-end">
                            <Clock className="w-3 h-3 mr-1" />
                            {formatDate(project.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-design-id="quick-actions-card">
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common tasks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Link href="/dashboard/projects?action=new" className="block">
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    data-design-id="action-new-project"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    New Project
                  </Button>
                </Link>
                <Link href="/dashboard/upload" className="block">
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    data-design-id="action-bulk-upload"
                  >
                    <FolderOpen className="w-4 h-4 mr-2" />
                    Bulk Upload
                  </Button>
                </Link>
                <Link href="/dashboard/reports" className="block">
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    data-design-id="action-view-reports"
                  >
                    <TrendingUp className="w-4 h-4 mr-2" />
                    View Reports
                  </Button>
                </Link>
                {isSystemOwner && (
                  <>
                    <Link href="/dashboard/organizations?action=new" className="block">
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        data-design-id="action-new-org"
                      >
                        <Building2 className="w-4 h-4 mr-2" />
                        New Organization
                      </Button>
                    </Link>
                    <Link href="/dashboard/users" className="block">
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        data-design-id="action-manage-users"
                      >
                        <Building2 className="w-4 h-4 mr-2" />
                        Manage Users
                      </Button>
                    </Link>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}