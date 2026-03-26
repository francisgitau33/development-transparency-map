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
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Plus, Building2, Search, ExternalLink, FolderOpen, Users } from "lucide-react";

interface Organization {
  id: string;
  name: string;
  type: string;
  countryCode: string;
  website: string | null;
  contactEmail: string | null;
  description: string | null;
  active: boolean;
  _count: {
    projects: number;
    users: number;
  };
}

interface Country {
  code: string;
  name: string;
}

const ORG_TYPES = [
  { value: "LNGO", label: "Local NGO" },
  { value: "INGO", label: "International NGO" },
  { value: "FOUNDATION", label: "Foundation" },
  { value: "GOVERNMENT", label: "Government" },
  { value: "OTHER", label: "Other" },
];

export default function OrganizationsPage() {
  const { isSystemOwner } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    type: "LNGO",
    countryCode: "",
    website: "",
    contactEmail: "",
    description: "",
    active: true,
  });

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
    } catch (err) {
      setError("Unable to load organizations. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setFormData({
      name: "",
      type: "LNGO",
      countryCode: "",
      website: "",
      contactEmail: "",
      description: "",
      active: true,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create organization");
      }

      toast.success("Organization created successfully");
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create organization");
    } finally {
      setSaving(false);
    }
  };

  const filteredOrganizations = organizations.filter(
    (org) =>
      org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getCountryName = (code: string) => countries.find((c) => c.code === code)?.name || code;
  const getOrgTypeLabel = (type: string) => ORG_TYPES.find((t) => t.value === type)?.label || type;

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
            onClick={() => setDialogOpen(true)}
            data-design-id="organizations-add-button"
            className="bg-emerald-600 hover:bg-emerald-700"
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
              <CardDescription>{filteredOrganizations.length} organizations</CardDescription>
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
              description={isSystemOwner ? "Create your first organization to get started" : "No organizations available"}
              action={
                isSystemOwner && (
                  <Button onClick={() => setDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
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
                  <TableHead>Country</TableHead>
                  <TableHead>Projects</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead>Status</TableHead>
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
                              className="text-sm text-emerald-600 hover:underline flex items-center"
                            >
                              <ExternalLink className="w-3 h-3 mr-1" />
                              Website
                            </a>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{getOrgTypeLabel(org.type)}</Badge>
                    </TableCell>
                    <TableCell>{getCountryName(org.countryCode)}</TableCell>
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
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-50 text-slate-700"
                        }
                      >
                        {org.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" data-design-id="organization-dialog">
          <DialogHeader>
            <DialogTitle>New Organization</DialogTitle>
            <DialogDescription>
              Add a new partner organization to the platform
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Organization Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="type">Type *</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData({ ...formData, type: value })}
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
              </div>

              <div className="grid gap-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  type="url"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  placeholder="https://..."
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="contactEmail">Contact Email</Label>
                <Input
                  id="contactEmail"
                  type="email"
                  value={formData.contactEmail}
                  onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="active"
                  checked={formData.active}
                  onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
                />
                <Label htmlFor="active">Active</Label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {saving ? "Creating..." : "Create Organization"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}