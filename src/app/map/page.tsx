"use client";

import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { PublicLayout } from "@/components/public/PublicLayout";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { X, Filter, MapPin, Building2, Layers, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { SectorIcon, SectorLegendItem } from "@/components/shared/SectorIcon";

const MapComponent = dynamic(
  () => import("@/components/public/MapComponent").then((mod) => mod.MapComponent),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-slate-100">
        <LoadingState message="Loading map..." />
      </div>
    ),
  }
);

interface Project {
  id: string;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  countryCode: string;
  sectorKey: string;
  status: string;
  locationName: string | null;
  targetBeneficiaries: number | null;
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

export default function MapPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [countryFilter, setCountryFilter] = useState<string>("_all");
  const [sectorFilter, setSectorFilter] = useState<string>("_all");
  const [statusFilter, setStatusFilter] = useState<string>("_all");
  const [orgTypeFilter, setOrgTypeFilter] = useState<string>("_all");

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectsRes, countriesRes, sectorsRes] = await Promise.all([
        fetch("/api/projects?forMap=true"),
        fetch("/api/reference/countries?activeOnly=true"),
        fetch("/api/reference/sectors?activeOnly=true"),
      ]);

      if (!projectsRes.ok || !countriesRes.ok || !sectorsRes.ok) {
        throw new Error("Failed to load data");
      }

      const [projectsData, countriesData, sectorsData] = await Promise.all([
        projectsRes.json(),
        countriesRes.json(),
        sectorsRes.json(),
      ]);

      setProjects(projectsData.projects || []);
      setCountries(countriesData.countries || []);
      setSectors(sectorsData.sectors || []);
    } catch (err) {
      setError("Unable to load map data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      if (countryFilter !== "_all" && project.countryCode !== countryFilter) return false;
      if (sectorFilter !== "_all" && project.sectorKey !== sectorFilter) return false;
      if (statusFilter !== "_all" && project.status !== statusFilter) return false;
      if (orgTypeFilter !== "_all" && project.organization.type !== orgTypeFilter) return false;
      return true;
    });
  }, [projects, countryFilter, sectorFilter, statusFilter, orgTypeFilter]);

  const clearFilters = () => {
    setCountryFilter("_all");
    setSectorFilter("_all");
    setStatusFilter("_all");
    setOrgTypeFilter("_all");
  };

  const hasFilters = countryFilter !== "_all" || sectorFilter !== "_all" || statusFilter !== "_all" || orgTypeFilter !== "_all";

  const [legendExpanded, setLegendExpanded] = useState(true);

  const stats = useMemo(() => {
    const active = filteredProjects.filter((p) => p.status === "ACTIVE").length;
    const planned = filteredProjects.filter((p) => p.status === "PLANNED").length;
    const completed = filteredProjects.filter((p) => p.status === "COMPLETED").length;
    const uniqueOrgs = new Set(filteredProjects.map((p) => p.organization.id)).size;
    return { total: filteredProjects.length, active, planned, completed, uniqueOrgs };
  }, [filteredProjects]);

  return (
    <PublicLayout fullHeight>
      <div
        data-design-id="map-page"
        className="flex-1 flex flex-col"
      >
        <div
          data-design-id="map-toolbar"
          className="bg-white border-b border-slate-200 px-4 py-3 relative z-[1000]"
        >
          <div
            data-design-id="map-toolbar-container"
            className="max-w-7xl mx-auto flex flex-wrap items-center gap-3"
          >
            <div
              data-design-id="map-filter-icon"
              className="flex items-center text-slate-700 font-medium"
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </div>

            <Select value={countryFilter} onValueChange={setCountryFilter}>
              <SelectTrigger data-design-id="map-filter-country" className="w-[160px]">
                <SelectValue placeholder="All Countries" />
              </SelectTrigger>
              <SelectContent className="z-[1100]">
                <SelectItem value="_all">All Countries</SelectItem>
                {countries.map((country) => (
                  <SelectItem key={country.code} value={country.code}>
                    {country.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sectorFilter} onValueChange={setSectorFilter}>
              <SelectTrigger data-design-id="map-filter-sector" className="w-[180px]">
                <SelectValue placeholder="All Sectors" />
              </SelectTrigger>
              <SelectContent className="z-[1100]">
                <SelectItem value="_all">All Sectors</SelectItem>
                {sectors.map((sector) => (
                  <SelectItem key={sector.key} value={sector.key}>
                    <div className="flex items-center gap-2">
                      <SectorIcon iconKey={sector.icon} color={sector.color} size="xs" />
                      <span>{sector.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-design-id="map-filter-status" className="w-[140px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent className="z-[1100]">
                <SelectItem value="_all">All Status</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="PLANNED">Planned</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
              </SelectContent>
            </Select>

            <Select value={orgTypeFilter} onValueChange={setOrgTypeFilter}>
              <SelectTrigger data-design-id="map-filter-orgtype" className="w-[160px]">
                <SelectValue placeholder="All Org Types" />
              </SelectTrigger>
              <SelectContent className="z-[1100]">
                <SelectItem value="_all">All Org Types</SelectItem>
                <SelectItem value="LNGO">Local NGO</SelectItem>
                <SelectItem value="INGO">International NGO</SelectItem>
                <SelectItem value="FOUNDATION">Foundation</SelectItem>
                <SelectItem value="GOVERNMENT">Government</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                data-design-id="map-clear-filters"
                className="text-slate-600"
              >
                <X className="w-4 h-4 mr-1" />
                Clear
              </Button>
            )}

            <div
              data-design-id="map-stats"
              className="ml-auto flex items-center gap-4 text-sm text-slate-600"
            >
              <span data-design-id="map-stats-projects" className="flex items-center">
                <MapPin className="w-4 h-4 mr-1" />
                {stats.total} Projects
              </span>
              <span data-design-id="map-stats-orgs" className="flex items-center">
                <Building2 className="w-4 h-4 mr-1" />
                {stats.uniqueOrgs} Organizations
              </span>
            </div>
          </div>
        </div>

        <div
          data-design-id="map-content"
          className="flex-1 relative"
        >
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-100 z-10">
              <LoadingState message="Loading map data..." />
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-100 z-10">
              <ErrorState message={error} onRetry={fetchData} />
            </div>
          )}

          {!loading && !error && (
            <MapComponent projects={filteredProjects} sectors={sectors} />
          )}

          <Card
            data-design-id="map-legend"
            className="absolute bottom-4 left-4 z-[1000] bg-white/95 backdrop-blur-sm shadow-lg w-48 md:w-56"
          >
            <button
              onClick={() => setLegendExpanded(!legendExpanded)}
              data-design-id="map-legend-header"
              className="flex items-center justify-between w-full p-3 font-semibold text-slate-900 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center">
                <Layers className="w-4 h-4 mr-2" />
                Legend
              </div>
              {legendExpanded ? (
                <ChevronDown className="w-4 h-4 text-slate-500" />
              ) : (
                <ChevronUp className="w-4 h-4 text-slate-500" />
              )}
            </button>
            {legendExpanded && (
              <div
                data-design-id="map-legend-items"
                className="px-3 pb-3 space-y-1.5 max-h-48 overflow-y-auto"
              >
                {error && sectors.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-amber-600">
                    <AlertCircle className="w-4 h-4" />
                    <span>Sector data unavailable</span>
                  </div>
                ) : sectors.length === 0 ? (
                  <p className="text-sm text-slate-500">No sectors available</p>
                ) : (
                  sectors.map((sector) => (
                    <SectorLegendItem
                      key={sector.key}
                      iconKey={sector.icon}
                      name={sector.name}
                      color={sector.color}
                    />
                  ))
                )}
              </div>
            )}
          </Card>

          <Card
            data-design-id="map-summary"
            className="absolute bottom-4 right-4 z-[1000] p-4 bg-white/95 backdrop-blur-sm"
          >
            <div
              data-design-id="map-summary-header"
              className="font-semibold text-slate-900 mb-3"
            >
              Summary
            </div>
            <div
              data-design-id="map-summary-stats"
              className="grid grid-cols-2 gap-3 text-sm"
            >
              <div data-design-id="map-summary-active">
                <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200">
                  Active: {stats.active}
                </Badge>
              </div>
              <div data-design-id="map-summary-planned">
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                  Planned: {stats.planned}
                </Badge>
              </div>
              <div data-design-id="map-summary-completed">
                <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">
                  Completed: {stats.completed}
                </Badge>
              </div>
              <div data-design-id="map-summary-total">
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  Total: {stats.total}
                </Badge>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </PublicLayout>
  );
}