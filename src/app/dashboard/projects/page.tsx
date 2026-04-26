"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, MapPin, FolderOpen, Search, Eye } from "lucide-react";
import Link from "next/link";
import { SectorIcon } from "@/components/shared/SectorIcon";

interface Project {
  id: string;
  title: string;
  description: string;
  countryCode: string;
  sectorKey: string;
  status: string;
  visibility: string;
  startDate: string;
  endDate: string | null;
  budgetUsd: number | null;
  targetBeneficiaries: number | null;
  latitude: number;
  longitude: number;
  locationName: string | null;
  organization: {
    id: string;
    name: string;
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

interface Organization {
  id: string;
  name: string;
}

export default function ProjectsPage() {
  const { isSystemOwner } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    organizationId: "",
    countryCode: "",
    sectorKey: "",
    status: "PLANNED",
    visibility: "PENDING_REVIEW",
    startDate: "",
    endDate: "",
    budgetUsd: "",
    targetBeneficiaries: "",
    latitude: "",
    longitude: "",
    locationName: "",
  });

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectsRes, countriesRes, sectorsRes, orgsRes] = await Promise.all([
        fetch("/api/projects"),
        fetch("/api/reference/countries?activeOnly=true"),
        fetch("/api/reference/sectors?activeOnly=true"),
        fetch("/api/organizations?activeOnly=true"),
      ]);

      if (!projectsRes.ok) throw new Error("Failed to load projects");

      const [projectsData, countriesData, sectorsData, orgsData] = await Promise.all([
        projectsRes.json(),
        countriesRes.json(),
        sectorsRes.json(),
        orgsRes.json(),
      ]);

      setProjects(projectsData.projects || []);
      setCountries(countriesData.countries || []);
      setSectors(sectorsData.sectors || []);
      setOrganizations(orgsData.organizations || []);
    } catch (err) {
      setError("Unable to load projects. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      organizationId: "",
      countryCode: "",
      sectorKey: "",
      status: "PLANNED",
      visibility: isSystemOwner ? "PUBLISHED" : "PENDING_REVIEW",
      startDate: "",
      endDate: "",
      budgetUsd: "",
      targetBeneficiaries: "",
      latitude: "",
      longitude: "",
      locationName: "",
    });
    setEditingProject(null);
  };

  const openDialog = (project?: Project) => {
    if (project) {
      setEditingProject(project);
      setFormData({
        title: project.title,
        description: project.description,
        organizationId: project.organization.id,
        countryCode: project.countryCode,
        sectorKey: project.sectorKey,
        status: project.status,
        visibility: project.visibility || "PENDING_REVIEW",
        startDate: project.startDate.split("T")[0],
        endDate: project.endDate ? project.endDate.split("T")[0] : "",
        budgetUsd: project.budgetUsd?.toString() || "",
        targetBeneficiaries: project.targetBeneficiaries?.toString() || "",
        latitude: project.latitude.toString(),
        longitude: project.longitude.toString(),
        locationName: project.locationName || "",
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const url = editingProject ? `/api/projects/${editingProject.id}` : "/api/projects";
      const method = editingProject ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          budgetUsd: formData.budgetUsd ? Number.parseFloat(formData.budgetUsd) : null,
          targetBeneficiaries: formData.targetBeneficiaries ? Number.parseInt(formData.targetBeneficiaries) : null,
          latitude: Number.parseFloat(formData.latitude),
          longitude: Number.parseFloat(formData.longitude),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save project");
      }

      toast.success(editingProject ? "Project updated successfully" : "Project created successfully");
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save project");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (project: Project) => {
    if (!confirm(`Are you sure you want to delete "${project.title}"?`)) return;

    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete project");
      toast.success("Project deleted successfully");
      fetchData();
    } catch (err) {
      toast.error("Failed to delete project");
    }
  };

  const filteredProjects = projects.filter(
    (p) =>
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.organization.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getCountryName = (code: string) => countries.find((c) => c.code === code)?.name || code;
  const getSector = (key: string) => sectors.find((s) => s.key === key);
  const getSectorName = (key: string) => getSector(key)?.name || key;

  return (
    <div data-design-id="projects-page" className="p-8">
      <div
        data-design-id="projects-header"
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1
            data-design-id="projects-title"
            className="text-2xl font-bold text-slate-900"
          >
            Projects
          </h1>
          <p
            data-design-id="projects-subtitle"
            className="text-slate-600"
          >
            Manage development projects
          </p>
        </div>
        <Button
          onClick={() => openDialog()}
          data-design-id="projects-add-button"
          className="bg-sky-600 hover:bg-sky-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Project
        </Button>
      </div>

      <Card data-design-id="projects-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Projects</CardTitle>
              <CardDescription>{filteredProjects.length} projects</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-design-id="projects-search"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && <LoadingState message="Loading projects..." />}

          {error && <ErrorState message={error} onRetry={fetchData} />}

          {!loading && !error && filteredProjects.length === 0 && (
            <EmptyState
              icon={<FolderOpen className="w-8 h-8 text-slate-400" />}
              title="No projects found"
              description="Create your first project to get started"
              action={
                <Button onClick={() => openDialog()} className="bg-sky-600 hover:bg-sky-700">
                  <Plus className="w-4 h-4 mr-2" />
                  New Project
                </Button>
              }
            />
          )}

          {!loading && !error && filteredProjects.length > 0 && (
            <Table data-design-id="projects-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Sector</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map((project) => (
                  <TableRow key={project.id} data-design-id={`project-row-${project.id}`}>
                    <TableCell>
                      <div className="font-medium">{project.title}</div>
                      <div className="text-sm text-slate-500 truncate max-w-xs">
                        {project.description}
                      </div>
                    </TableCell>
                    <TableCell>{project.organization.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <MapPin className="w-4 h-4 text-slate-400 mr-1" />
                        {getCountryName(project.countryCode)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <SectorIcon 
                          iconKey={getSector(project.sectorKey)?.icon} 
                          color={getSector(project.sectorKey)?.color} 
                          size="sm" 
                        />
                        {getSectorName(project.sectorKey)}
                      </div>
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        data-design-id={`project-visibility-${project.id}`}
                        className={
                          project.visibility === "PUBLISHED"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : project.visibility === "PENDING_REVIEW"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : project.visibility === "UNPUBLISHED"
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : "bg-slate-50 text-slate-700 border-slate-200"
                        }
                      >
                        {project.visibility?.replace("_", " ") || "PENDING REVIEW"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/projects/${project.id}`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          data-design-id={`project-view-${project.id}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDialog(project)}
                        data-design-id={`project-edit-${project.id}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(project)}
                        className="text-red-600 hover:text-red-700"
                        data-design-id={`project-delete-${project.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-design-id="project-dialog">
          <DialogHeader>
            <DialogTitle>
              {editingProject ? "Edit Project" : "New Project"}
            </DialogTitle>
            <DialogDescription>
              {editingProject
                ? "Update the project details below"
                : "Fill in the details to create a new project"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                  rows={3}
                />
              </div>

              {isSystemOwner && (
                <div className="grid gap-2">
                  <Label htmlFor="organizationId">Organization *</Label>
                  <Select
                    value={formData.organizationId}
                    onValueChange={(value) => setFormData({ ...formData, organizationId: value })}
                  >
                    <SelectTrigger id="organizationId">
                      <SelectValue placeholder="Select organization" />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations.map((org) => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="countryCode">Country *</Label>
                  <Select
                    value={formData.countryCode}
                    onValueChange={(value) => setFormData({ ...formData, countryCode: value })}
                  >
                    <SelectTrigger id="countryCode">
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {countries.map((country) => (
                        <SelectItem key={country.code} value={country.code}>
                          {country.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="sectorKey">Sector *</Label>
                  <Select
                    value={formData.sectorKey}
                    onValueChange={(value) => setFormData({ ...formData, sectorKey: value })}
                  >
                    <SelectTrigger id="sectorKey">
                      <SelectValue placeholder="Select sector" />
                    </SelectTrigger>
                    <SelectContent>
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
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="status">Status *</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PLANNED">Planned</SelectItem>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="COMPLETED">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2" data-design-id="project-visibility-field">
                  <Label htmlFor="visibility">Visibility</Label>
                  <Select
                    value={formData.visibility}
                    onValueChange={(value) =>
                      setFormData({ ...formData, visibility: value })
                    }
                  >
                    <SelectTrigger id="visibility">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DRAFT">Draft</SelectItem>
                      <SelectItem value="PENDING_REVIEW">Pending review</SelectItem>
                      {isSystemOwner && (
                        <SelectItem value="PUBLISHED">Published</SelectItem>
                      )}
                      {isSystemOwner && (
                        <SelectItem value="UNPUBLISHED">Unpublished</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">
                    {isSystemOwner
                      ? "Only Published projects appear on the public map."
                      : "Partner Admins submit at Draft or Pending review. A System Owner will publish."}
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="startDate">Start Date *</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="latitude">Latitude *</Label>
                  <Input
                    id="latitude"
                    type="number"
                    step="any"
                    value={formData.latitude}
                    onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                    required
                    placeholder="-90 to 90"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="longitude">Longitude *</Label>
                  <Input
                    id="longitude"
                    type="number"
                    step="any"
                    value={formData.longitude}
                    onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                    required
                    placeholder="-180 to 180"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="locationName">Location Name</Label>
                  <Input
                    id="locationName"
                    value={formData.locationName}
                    onChange={(e) => setFormData({ ...formData, locationName: e.target.value })}
                    placeholder="City, Region"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="budgetUsd">Budget (USD)</Label>
                  <Input
                    id="budgetUsd"
                    type="number"
                    step="0.01"
                    value={formData.budgetUsd}
                    onChange={(e) => setFormData({ ...formData, budgetUsd: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="targetBeneficiaries">Target Beneficiaries</Label>
                <Input
                  id="targetBeneficiaries"
                  type="number"
                  value={formData.targetBeneficiaries}
                  onChange={(e) => setFormData({ ...formData, targetBeneficiaries: e.target.value })}
                  placeholder="Number of people the project aims to reach"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-sky-600 hover:bg-sky-700"
              >
                {saving ? "Saving..." : editingProject ? "Update Project" : "Create Project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}