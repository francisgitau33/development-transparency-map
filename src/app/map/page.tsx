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
  administrativeAreaId: string | null;
  donorId: string | null;
  // Optional grant / funding / budget-line reference. Passed through to
  // the map popup; never used for filtering or analytics.
  donorFundingCode: string | null;
  organization: {
    id: string;
    name: string;
    type: string;
  };
  administrativeArea?: {
    id: string;
    name: string;
    type: string | null;
    countryCode: string;
  } | null;
  donor?: {
    id: string;
    name: string;
    donorType: string | null;
  } | null;
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

export default function MapPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [administrativeAreas, setAdministrativeAreas] = useState<
    AdministrativeArea[]
  >([]);
  const [donors, setDonors] = useState<Donor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [countryFilter, setCountryFilter] = useState<string>("_all");
  const [sectorFilter, setSectorFilter] = useState<string>("_all");
  const [statusFilter, setStatusFilter] = useState<string>("_all");
  const [orgTypeFilter, setOrgTypeFilter] = useState<string>("_all");
  const [districtFilter, setDistrictFilter] = useState<string>("_all");
  const [donorFilter, setDonorFilter] = useState<string>("_all");
  // Organization filter — lets an organisation (or anyone) isolate the
  // markers owned by a single implementing organisation across all
  // countries / districts / sectors / donors. Derived from the projects
  // already loaded (so we don't broaden the public API surface).
  const [organizationFilter, setOrganizationFilter] = useState<string>("_all");

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectsRes, countriesRes, sectorsRes, areasRes, donorsRes] =
        await Promise.all([
          fetch("/api/projects?forMap=true"),
          fetch("/api/reference/countries?activeOnly=true"),
          fetch("/api/reference/sectors?activeOnly=true"),
          fetch("/api/reference/administrative-areas?activeOnly=true"),
          fetch("/api/reference/donors?activeOnly=true"),
        ]);

      if (!projectsRes.ok || !countriesRes.ok || !sectorsRes.ok) {
        throw new Error("Failed to load data");
      }

      const [projectsData, countriesData, sectorsData, areasData, donorsData] =
        await Promise.all([
          projectsRes.json(),
          countriesRes.json(),
          sectorsRes.json(),
          areasRes.ok ? areasRes.json() : { administrativeAreas: [] },
          donorsRes.ok ? donorsRes.json() : { donors: [] },
        ]);

      setProjects(projectsData.projects || []);
      setCountries(countriesData.countries || []);
      setSectors(sectorsData.sectors || []);
      setAdministrativeAreas(areasData.administrativeAreas || []);
      setDonors(donorsData.donors || []);
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
      if (
        districtFilter !== "_all" &&
        project.administrativeAreaId !== districtFilter
      ) {
        return false;
      }
      if (donorFilter !== "_all" && project.donorId !== donorFilter) {
        return false;
      }
      if (
        organizationFilter !== "_all" &&
        project.organization.id !== organizationFilter
      ) {
        return false;
      }
      return true;
    });
  }, [
    projects,
    countryFilter,
    sectorFilter,
    statusFilter,
    orgTypeFilter,
    districtFilter,
    donorFilter,
    organizationFilter,
  ]);

  // Reset district when country changes (scoping is country-specific).
  useEffect(() => {
    setDistrictFilter("_all");
  }, [countryFilter]);

  const availableDistricts = useMemo(() => {
    if (countryFilter === "_all") return administrativeAreas;
    return administrativeAreas.filter((a) => a.countryCode === countryFilter);
  }, [administrativeAreas, countryFilter]);

  const clearFilters = () => {
    setCountryFilter("_all");
    setSectorFilter("_all");
    setStatusFilter("_all");
    setOrgTypeFilter("_all");
    setDistrictFilter("_all");
    setDonorFilter("_all");
    setOrganizationFilter("_all");
  };

  const hasFilters =
    countryFilter !== "_all" ||
    sectorFilter !== "_all" ||
    statusFilter !== "_all" ||
    orgTypeFilter !== "_all" ||
    districtFilter !== "_all" ||
    donorFilter !== "_all" ||
    organizationFilter !== "_all";

  // Unique organization options, derived from the loaded projects. Using
  // the project set (rather than a separate /api/organizations call) keeps
  // the list tightly scoped to organisations that actually have visible
  // projects on the map, and avoids introducing a new public endpoint.
  const organizationOptions = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const p of projects) {
      const org = p.organization;
      if (org?.id && !seen.has(org.id)) {
        seen.set(org.id, { id: org.id, name: org.name });
      }
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [projects]);

  const [legendExpanded, setLegendExpanded] = useState(true);

  const stats = useMemo(() => {
    const active = filteredProjects.filter((p) => p.status === "ACTIVE").length;
    const planned = filteredProjects.filter((p) => p.status === "PLANNED").length;
    const completed = filteredProjects.filter((p) => p.status === "COMPLETED").length;
    const uniqueOrgs = new Set(filteredProjects.map((p) => p.organization.id)).size;
    return { total: filteredProjects.length, active, planned, completed, uniqueOrgs };
  }, [filteredProjects]);

  return (
    <PublicLayout fullBleed>
      {/*
        Layout contract for /map:
        - PublicLayout.fullBleed => outer `h-screen overflow-hidden` and
          main is `flex-1 min-h-0 flex-col`, so the Leaflet container owns
          all vertical space below the 64px fixed header minus the compact
          toolbar.
        - `map-content` is `flex-1 min-h-0 relative` so (a) it shrinks
          correctly inside the flex column and (b) the Legend / Summary
          cards can float above the map via absolute positioning without
          reserving any footer height.
      */}
      <div
        data-design-id="map-page"
        className="flex-1 min-h-0 flex flex-col"
      >
        <div
          data-design-id="map-toolbar"
          className="bg-white border-b border-slate-200 px-4 py-2 relative z-[1000] shrink-0"
        >
          <div
            data-design-id="map-toolbar-container"
            className="max-w-7xl mx-auto flex flex-wrap items-center gap-x-2 gap-y-1.5"
          >
            <div
              data-design-id="map-filter-icon"
              className="flex items-center text-sm text-slate-700 font-medium"
            >
              <Filter className="w-4 h-4 mr-1.5" />
              Filters
            </div>

            <Select value={countryFilter} onValueChange={setCountryFilter}>
              <SelectTrigger data-design-id="map-filter-country" className="h-8 w-[140px] text-sm">
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
              <SelectTrigger data-design-id="map-filter-sector" className="h-8 w-[150px] text-sm">
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
              <SelectTrigger data-design-id="map-filter-status" className="h-8 w-[120px] text-sm">
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
              <SelectTrigger data-design-id="map-filter-orgtype" className="h-8 w-[140px] text-sm">
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

            <Select
              value={districtFilter}
              onValueChange={setDistrictFilter}
              disabled={countryFilter === "_all"}
            >
              <SelectTrigger
                data-design-id="map-filter-district"
                className="h-8 w-[170px] text-sm"
                title={
                  countryFilter === "_all"
                    ? "Select a country to filter by District / County"
                    : undefined
                }
              >
                <SelectValue
                  placeholder={
                    countryFilter === "_all"
                      ? "Select country first"
                      : "All Districts / Counties"
                  }
                />
              </SelectTrigger>
              <SelectContent className="z-[1100]">
                <SelectItem value="_all">All Districts / Counties</SelectItem>
                {availableDistricts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                    {a.type ? ` · ${a.type}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={donorFilter} onValueChange={setDonorFilter}>
              <SelectTrigger data-design-id="map-filter-donor" className="h-8 w-[140px] text-sm">
                <SelectValue placeholder="All Donors" />
              </SelectTrigger>
              <SelectContent className="z-[1100]">
                <SelectItem value="_all">All Donors</SelectItem>
                {donors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={organizationFilter}
              onValueChange={setOrganizationFilter}
            >
              <SelectTrigger
                data-design-id="map-filter-organization"
                className="h-8 w-[180px] text-sm"
                title="Filter markers by implementing organisation."
              >
                <SelectValue placeholder="All Organizations" />
              </SelectTrigger>
              <SelectContent className="z-[1100]">
                <SelectItem value="_all">All Organizations</SelectItem>
                {organizationOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                data-design-id="map-clear-filters"
                className="h-8 px-2 text-slate-600"
              >
                <X className="w-4 h-4 mr-1" />
                Clear
              </Button>
            )}

            <div
              data-design-id="map-stats"
              className="ml-auto flex items-center gap-3 text-sm text-slate-600"
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
          className="flex-1 min-h-0 relative"
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
            className="absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur-sm shadow-lg w-44 md:w-52"
          >
            <button
              onClick={() => setLegendExpanded(!legendExpanded)}
              data-design-id="map-legend-header"
              className="flex items-center justify-between w-full px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 transition-colors"
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
                className="px-3 pb-2.5 space-y-1 max-h-40 overflow-y-auto text-sm"
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
            className="absolute bottom-3 right-3 z-[1000] p-2.5 bg-white/95 backdrop-blur-sm shadow-lg"
          >
            <div
              data-design-id="map-summary-header"
              className="text-xs font-semibold text-slate-900 mb-1.5"
            >
              Summary
            </div>
            <div
              data-design-id="map-summary-stats"
              className="grid grid-cols-2 gap-1.5 text-xs"
            >
              <Badge
                data-design-id="map-summary-active"
                variant="outline"
                className="bg-sky-50 text-sky-700 border-sky-200"
              >
                Active: {stats.active}
              </Badge>
              <Badge
                data-design-id="map-summary-planned"
                variant="outline"
                className="bg-amber-50 text-amber-700 border-amber-200"
              >
                Planned: {stats.planned}
              </Badge>
              <Badge
                data-design-id="map-summary-completed"
                variant="outline"
                className="bg-slate-50 text-slate-700 border-slate-200"
              >
                Completed: {stats.completed}
              </Badge>
              <Badge
                data-design-id="map-summary-total"
                variant="outline"
                className="bg-blue-50 text-blue-700 border-blue-200"
              >
                Total: {stats.total}
              </Badge>
            </div>
          </Card>
        </div>
      </div>
    </PublicLayout>
  );
}