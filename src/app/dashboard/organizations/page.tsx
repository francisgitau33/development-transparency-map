"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  CountriesOfOperationSelect,
  formatOrganizationCountries,
  type CountryOption,
} from "@/components/shared/CountriesOfOperationSelect";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import {
  Plus,
  Building2,
  Search,
  ExternalLink,
  FolderOpen,
  Users,
  Pencil,
  Globe,
  Trash2,
} from "lucide-react";

interface Organization {
  id: string;
  name: string;
  type: string;
  countryScope: "ALL" | "SELECTED";
  countryIds: string[];
  // Legacy field — still emitted by the API for back-compat. We prefer
  // countryScope/countryIds everywhere in the UI.
  countryCode: string | null;
  website: string | null;
  contactEmail: string | null;
  description: string | null;
  active: boolean;
  _count: {
    projects: number;
    users: number;
  };
}

const ORG_TYPES = [
  { value: "LNGO", label: "Local NGO" },
  { value: "INGO", label: "International NGO" },
  { value: "FOUNDATION", label: "Foundation" },
  { value: "GOVERNMENT", label: "Government" },
  { value: "OTHER", label: "Other" },
];

interface FormState {
  name: string;
  type: string;
  countryScope: "ALL" | "SELECTED";
  countryIds: string[];
  website: string;
  contactEmail: string;
  description: string;
  active: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  type: "LNGO",
  countryScope: "SELECTED",
  countryIds: [],
  website: "",
  contactEmail: "",
  description: "",
  active: true,
};

export default function OrganizationsPage() {
  const { isSystemOwner } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);

  // Delete confirmation state. Separate from the edit dialog so closing
  // one does not affect the other.
  const [deleteOrg, setDeleteOrg] = useState<Organization | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgsRes, countriesRes] = await Promise.all([
        fetch("/api/organizations"),
        fetch("/api/reference/countries?activeOnly=true"),
      ]);

      if (!orgsRes.ok) throw new Error("Failed to load organizations");

      const [orgsData, countriesData] = await Promise.all([
        orgsRes.json(),
        countriesRes.json(),
      ]);

      setOrganizations(orgsData.organizations || []);
      setCountries(countriesData.countries || []);
    } catch (_err) {
      setError("Unable to load organizations. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setFormData({ ...EMPTY_FORM });
    setEditingOrg(null);
  };

  const openDialog = (org?: Organization) => {
    if (org) {
      setEditingOrg(org);
      setFormData({
        name: org.name,
        type: org.type,
        countryScope: org.countryScope,
        countryIds: org.countryIds,
        website: org.website || "",
        contactEmail: org.contactEmail || "",
        description: org.description || "",
        active: org.active,
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side guard matching the server-side rule: scope=SELECTED must
    // have ≥ 1 country.
    if (
      formData.countryScope === "SELECTED" &&
      formData.countryIds.length === 0
    ) {
      toast.error(
        "Select at least one country of operation, or choose \"All Countries\".",
      );
      return;
    }

    setSaving(true);

    try {
      const url = editingOrg
        ? `/api/organizations/${editingOrg.id}`
        : "/api/organizations";
      const method = editingOrg ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          type: formData.type,
          countryScope: formData.countryScope,
          countryIds: formData.countryIds,
          website: formData.website,
          contactEmail: formData.contactEmail,
          description: formData.description,
          active: formData.active,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const detailMsg = Array.isArray(data.details)
          ? `: ${data.details.join("; ")}`
          : "";
        throw new Error(
          `${data.error || `Failed to ${editingOrg ? "update" : "create"} organization`}${detailMsg}`,
        );
      }

      toast.success(
        editingOrg
          ? "Organization updated successfully"
          : "Organization created successfully",
      );
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : `Failed to ${editingOrg ? "update" : "create"} organization`,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteOrg) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/organizations/${deleteOrg.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // The API returns 409 with a helpful message when linked
        // projects / users block the delete. Surface it verbatim.
        throw new Error(
          data.error ||
            "Failed to delete organization. Please try again.",
        );
      }

      toast.success(
        `Organization "${deleteOrg.name}" deleted successfully`,
      );
      setDeleteOrg(null);
      await fetchData();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to delete organization",
      );
    } finally {
      setDeleting(false);
    }
  };

  const filteredOrganizations = organizations.filter(
    (org) =>
      org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.type.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const getOrgTypeLabel = (type: string) =>
    ORG_TYPES.find((t) => t.value === type)?.label || type;

  return (
    <div data-design-id="organizations-page" className="p-8">
      <div
        data-design-id="organizations-header"
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1
            data-design-id="organizations-title"
            className="text-2xl font-bold text-slate-900"
          >
            Organizations
          </h1>
          <p
            data-design-id="organizations-subtitle"
            className="text-slate-600"
          >
            Manage partner organizations
          </p>
        </div>
        {isSystemOwner && (
          <Button
            onClick={() => openDialog()}
            data-design-id="organizations-add-button"
            className="bg-sky-600 hover:bg-sky-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Organization
          </Button>
        )}
      </div>

      <Card data-design-id="organizations-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Organizations</CardTitle>
              <CardDescription>
                {filteredOrganizations.length} organizations
              </CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search organizations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-design-id="organizations-search"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && <LoadingState message="Loading organizations..." />}

          {error && <ErrorState message={error} onRetry={fetchData} />}

          {!loading && !error && filteredOrganizations.length === 0 && (
            <EmptyState
              icon={<Building2 className="w-8 h-8 text-slate-400" />}
              title="No organizations found"
              description={
                isSystemOwner
                  ? "Create your first organization to get started"
                  : "No organizations available"
              }
              action={
                isSystemOwner && (
                  <Button
                    onClick={() => openDialog()}
                    className="bg-sky-600 hover:bg-sky-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    New Organization
                  </Button>
                )
              }
            />
          )}

          {!loading && !error && filteredOrganizations.length > 0 && (
            <Table data-design-id="organizations-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Countries of Operation</TableHead>
                  <TableHead>Projects</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead>Status</TableHead>
                  {isSystemOwner && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrganizations.map((org) => (
                  <TableRow key={org.id} data-design-id={`org-row-${org.id}`}>
                    <TableCell>
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center mr-3">
                          <Building2 className="w-5 h-5 text-slate-600" />
                        </div>
                        <div>
                          <div className="font-medium">{org.name}</div>
                          {org.website && (
                            <a
                              href={org.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-sky-600 hover:underline flex items-center"
                            >
                              <ExternalLink className="w-3 h-3 mr-1" />
                              Website
                            </a>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getOrgTypeLabel(org.type)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      {org.countryScope === "ALL" ? (
                        <Badge
                          variant="outline"
                          className="bg-sky-50 border-sky-300 text-sky-800 flex items-center gap-1 w-fit"
                          data-design-id={`org-country-all-${org.id}`}
                        >
                          <Globe className="w-3 h-3" />
                          All Countries
                        </Badge>
                      ) : org.countryIds.length === 0 ? (
                        <span
                          className="text-sm text-amber-600"
                          data-design-id={`org-country-missing-${org.id}`}
                        >
                          No country selected
                        </span>
                      ) : (
                        <span
                          className="text-sm text-slate-800"
                          data-design-id={`org-country-list-${org.id}`}
                          title={formatOrganizationCountries(
                            org.countryScope,
                            org.countryIds,
                            countries,
                          )}
                        >
                          {formatOrganizationCountries(
                            org.countryScope,
                            org.countryIds,
                            countries,
                          )}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <FolderOpen className="w-4 h-4 text-slate-400 mr-1" />
                        {org._count.projects}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <Users className="w-4 h-4 text-slate-400 mr-1" />
                        {org._count.users}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          org.active
                            ? "bg-sky-50 text-sky-700"
                            : "bg-slate-50 text-slate-700"
                        }
                      >
                        {org.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    {isSystemOwner && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDialog(org)}
                            data-design-id={`org-edit-${org.id}`}
                            aria-label={`Edit ${org.name}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteOrg(org)}
                            data-design-id={`org-delete-${org.id}`}
                            aria-label={`Delete ${org.name}`}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="max-w-lg max-h-[90vh] overflow-y-auto"
          data-design-id="organization-dialog"
        >
          <DialogHeader>
            <DialogTitle>
              {editingOrg ? "Edit Organization" : "New Organization"}
            </DialogTitle>
            <DialogDescription>
              {editingOrg
                ? "Update the organization details below"
                : "Add a new partner organization to the platform"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Organization Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="type">Type *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) =>
                    setFormData({ ...formData, type: value })
                  }
                >
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORG_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="countries-of-operation">
                  Countries of Operation *
                </Label>
                <p className="text-xs text-slate-500">
                  Select one or more countries where this organization
                  operates. Use &ldquo;All Countries&rdquo; for global or
                  multi-country INGOs.
                </p>
                <CountriesOfOperationSelect
                  id="countries-of-operation"
                  countries={countries}
                  scope={formData.countryScope}
                  selectedCodes={formData.countryIds}
                  onChange={(scope, selected) =>
                    setFormData((prev) => ({
                      ...prev,
                      countryScope: scope,
                      countryIds: selected,
                    }))
                  }
                  onUpdate={(updater) =>
                    setFormData((prev) => {
                      const next = updater({
                        scope: prev.countryScope,
                        ids: prev.countryIds,
                      });
                      return {
                        ...prev,
                        countryScope: next.scope,
                        countryIds: next.ids,
                      };
                    })
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  type="url"
                  value={formData.website}
                  onChange={(e) =>
                    setFormData({ ...formData, website: e.target.value })
                  }
                  placeholder="https://..."
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="contactEmail">Contact Email</Label>
                <Input
                  id="contactEmail"
                  type="email"
                  value={formData.contactEmail}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      contactEmail: e.target.value,
                    })
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={3}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="active"
                  checked={formData.active}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, active: checked })
                  }
                />
                <Label htmlFor="active">Active</Label>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-sky-600 hover:bg-sky-700"
              >
                {saving
                  ? editingOrg
                    ? "Updating..."
                    : "Creating..."
                  : editingOrg
                    ? "Update Organization"
                    : "Create Organization"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/*
        Delete confirmation dialog. Mirrors the reference-data delete
        UX: explicit confirmation required, shows dependency counts so
        the SYSTEM_OWNER can't accidentally destroy a populated org,
        and the primary action is styled destructively.
      */}
      <Dialog
        open={deleteOrg !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteOrg(null);
        }}
      >
        <DialogContent
          className="max-w-md"
          data-design-id="organization-delete-dialog"
        >
          <DialogHeader>
            <DialogTitle>Delete organization?</DialogTitle>
            <DialogDescription>
              This permanently removes{" "}
              <span className="font-medium text-slate-900">
                {deleteOrg?.name}
              </span>
              {" "}from the platform. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {deleteOrg &&
            (deleteOrg._count.projects > 0 || deleteOrg._count.users > 0) && (
              <div
                data-design-id="organization-delete-warning"
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              >
                <p className="font-medium mb-1">
                  This organization has linked records
                </p>
                <ul className="list-disc pl-5 space-y-0.5">
                  {deleteOrg._count.projects > 0 && (
                    <li>
                      {deleteOrg._count.projects} linked project
                      {deleteOrg._count.projects === 1 ? "" : "s"}
                    </li>
                  )}
                  {deleteOrg._count.users > 0 && (
                    <li>
                      {deleteOrg._count.users} assigned user
                      {deleteOrg._count.users === 1 ? "" : "s"}
                    </li>
                  )}
                </ul>
                <p className="mt-2">
                  Delete or reassign these before deleting the organization.
                  The server will refuse the delete otherwise.
                </p>
              </div>
            )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOrg(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              data-design-id="organization-delete-confirm"
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? "Deleting..." : "Delete Organization"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}