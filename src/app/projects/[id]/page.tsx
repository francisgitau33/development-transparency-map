"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { PublicLayout } from "@/components/public/PublicLayout";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectorIcon } from "@/components/shared/SectorIcon";
import {
  MapPin,
  Building2,
  Calendar,
  DollarSign,
  Globe,
  ArrowLeft,
  ExternalLink,
  Layers,
} from "lucide-react";

interface Project {
  id: string;
  title: string;
  description: string;
  countryCode: string;
  adminArea1: string | null;
  adminArea2: string | null;
  sectorKey: string;
  status: string;
  startDate: string;
  endDate: string | null;
  budgetUsd: number | null;
  latitude: number;
  longitude: number;
  locationName: string | null;
  dataSource: string | null;
  contactEmail: string | null;
  createdAt: string;
  organization: {
    id: string;
    name: string;
    type: string;
  };
}

interface Country {
  code: string;
  name: string;
}

interface Sector {
  key: string;
  name: string;
  icon: string;
  color: string;
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [country, setCountry] = useState<Country | null>(null);
  const [sector, setSector] = useState<Sector | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const projectRes = await fetch(`/api/projects/${resolvedParams.id}`);

        if (projectRes.status === 404) {
          setError("Project not found");
          setLoading(false);
          return;
        }

        if (!projectRes.ok) {
          throw new Error("Failed to load project");
        }

        const projectData = await projectRes.json();
        setProject(projectData.project);

        // Fetch reference data
        const [countriesRes, sectorsRes] = await Promise.all([
          fetch("/api/reference/countries?activeOnly=true"),
          fetch("/api/reference/sectors?activeOnly=true"),
        ]);

        if (countriesRes.ok) {
          const countriesData = await countriesRes.json();
          const foundCountry = countriesData.countries?.find(
            (c: Country) => c.code === projectData.project.countryCode
          );
          setCountry(foundCountry || null);
        }

        if (sectorsRes.ok) {
          const sectorsData = await sectorsRes.json();
          const foundSector = sectorsData.sectors?.find(
            (s: Sector) => s.key === projectData.project.sectorKey
          );
          setSector(foundSector || null);
        }
      } catch (err) {
        setError("Unable to load project details. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [resolvedParams.id]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "bg-sky-50 text-sky-700 border-sky-200";
      case "PLANNED":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "COMPLETED":
        return "bg-slate-50 text-slate-700 border-slate-200";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  const getOrgTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      LNGO: "Local NGO",
      INGO: "International NGO",
      FOUNDATION: "Foundation",
      GOVERNMENT: "Government",
      OTHER: "Other",
    };
    return labels[type] || type;
  };

  return (
    <PublicLayout>
      <div
        data-design-id="project-detail-page"
        className="min-h-screen bg-slate-50 py-8"
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Back navigation */}
          <div className="mb-6">
            <Link href="/map">
              <Button variant="ghost" className="text-slate-600 hover:text-slate-900">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Map
              </Button>
            </Link>
          </div>

          {loading && (
            <Card>
              <CardContent className="py-12">
                <LoadingState message="Loading project details..." />
              </CardContent>
            </Card>
          )}

          {error && (
            <Card>
              <CardContent className="py-12">
                <ErrorState
                  message={error}
                  onRetry={() => window.location.reload()}
                />
              </CardContent>
            </Card>
          )}

          {!loading && !error && project && (
            <>
              {/* Header Card */}
              <Card data-design-id="project-header-card" className="mb-6">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {sector && (
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: `${sector.color}20` }}
                        >
                          <SectorIcon
                            iconKey={sector.icon}
                            color={sector.color}
                            size="md"
                          />
                        </div>
                      )}
                      <div>
                        <h1
                          data-design-id="project-title"
                          className="text-2xl font-bold text-slate-900"
                        >
                          {project.title}
                        </h1>
                        <p className="text-slate-600">
                          {sector?.name || project.sectorKey}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={getStatusColor(project.status)}
                    >
                      {project.status}
                    </Badge>
                  </div>

                  <p
                    data-design-id="project-description"
                    className="text-slate-700 leading-relaxed mb-6"
                  >
                    {project.description}
                  </p>

                  {/* Quick Info Grid */}
                  <div
                    data-design-id="project-quick-info"
                    className="grid grid-cols-2 md:grid-cols-4 gap-4"
                  >
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Building2 className="w-4 h-4 text-slate-400" />
                      <span>{project.organization.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <MapPin className="w-4 h-4 text-slate-400" />
                      <span>{country?.name || project.countryCode}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <span>{formatDate(project.startDate)}</span>
                    </div>
                    {project.budgetUsd && (
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <DollarSign className="w-4 h-4 text-slate-400" />
                        <span>{formatCurrency(project.budgetUsd)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Details Grid */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Organization Details */}
                <Card data-design-id="project-org-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Building2 className="w-5 h-5 text-sky-600" />
                      Implementing Organization
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {project.organization.name}
                        </p>
                        <Badge variant="outline" className="mt-1">
                          {getOrgTypeLabel(project.organization.type)}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Location Details */}
                <Card data-design-id="project-location-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Globe className="w-5 h-5 text-sky-600" />
                      Location
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm text-slate-500">Country</p>
                        <p className="font-medium text-slate-900">
                          {country?.name || project.countryCode}
                        </p>
                      </div>
                      {project.locationName && (
                        <div>
                          <p className="text-sm text-slate-500">Location</p>
                          <p className="font-medium text-slate-900">
                            {project.locationName}
                          </p>
                        </div>
                      )}
                      {(project.adminArea1 || project.adminArea2) && (
                        <div>
                          <p className="text-sm text-slate-500">
                            Administrative Area
                          </p>
                          <p className="font-medium text-slate-900">
                            {[project.adminArea1, project.adminArea2]
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="text-sm text-slate-500">Coordinates</p>
                        <p className="font-medium text-slate-900">
                          {project.latitude.toFixed(4)}, {project.longitude.toFixed(4)}
                        </p>
                      </div>
                      <Link
                        href={`/map?lat=${project.latitude}&lng=${project.longitude}`}
                        className="inline-flex items-center text-sm text-sky-600 hover:text-sky-700"
                      >
                        <MapPin className="w-4 h-4 mr-1" />
                        View on Map
                      </Link>
                    </div>
                  </CardContent>
                </Card>

                {/* Timeline */}
                <Card data-design-id="project-timeline-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Calendar className="w-5 h-5 text-sky-600" />
                      Timeline
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm text-slate-500">Start Date</p>
                        <p className="font-medium text-slate-900">
                          {formatDate(project.startDate)}
                        </p>
                      </div>
                      {project.endDate && (
                        <div>
                          <p className="text-sm text-slate-500">End Date</p>
                          <p className="font-medium text-slate-900">
                            {formatDate(project.endDate)}
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="text-sm text-slate-500">Status</p>
                        <Badge
                          variant="outline"
                          className={getStatusColor(project.status)}
                        >
                          {project.status}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Sector & Budget */}
                <Card data-design-id="project-sector-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Layers className="w-5 h-5 text-sky-600" />
                      Sector & Funding
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm text-slate-500">Sector</p>
                        <div className="flex items-center gap-2 mt-1">
                          {sector && (
                            <SectorIcon
                              iconKey={sector.icon}
                              color={sector.color}
                              size="sm"
                            />
                          )}
                          <p className="font-medium text-slate-900">
                            {sector?.name || project.sectorKey}
                          </p>
                        </div>
                      </div>
                      {project.budgetUsd && (
                        <div>
                          <p className="text-sm text-slate-500">Budget (USD)</p>
                          <p className="font-medium text-slate-900 text-lg">
                            {formatCurrency(project.budgetUsd)}
                          </p>
                        </div>
                      )}
                      {project.dataSource && (
                        <div>
                          <p className="text-sm text-slate-500">Data Source</p>
                          <p className="font-medium text-slate-900">
                            {project.dataSource}
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Contact Info (if available) */}
              {project.contactEmail && (
                <Card data-design-id="project-contact-card" className="mt-6">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-500">Contact</p>
                        <a
                          href={`mailto:${project.contactEmail}`}
                          className="text-sky-600 hover:text-sky-700 font-medium"
                        >
                          {project.contactEmail}
                        </a>
                      </div>
                      <a
                        href={`mailto:${project.contactEmail}`}
                        className="inline-flex items-center"
                      >
                        <Button variant="outline" size="sm">
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Contact Project
                        </Button>
                      </a>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}