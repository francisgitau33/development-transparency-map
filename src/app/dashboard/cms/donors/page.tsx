"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { DeleteReferenceDialog } from "@/components/shared/DeleteReferenceDialog";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import {
  Plus,
  ArrowLeft,
  Pencil,
  HandCoins,
  Search,
  ExternalLink,
  Trash2,
} from "lucide-react";

interface Donor {
  id: string;
  name: string;
  donorType: string | null;
  countryOfOrigin: string | null;
  website: string | null;
  active: boolean;
  sortOrder: number;
}

const DONOR_TYPE_OPTIONS = [
  "Bilateral",
  "Multilateral",
  "Foundation",
  "Corporate",
  "Government",
  "Individual",
  "INGO",
  "Pooled Fund",
  "Other",
];

export default function DonorsCMSPage() {
  const router = useRouter();
  const { isSystemOwner, isLoading: authLoading } = useAuth();
  const [donors, setDonors] = useState<Donor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Donor | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete confirmation — target row drives the DeleteReferenceDialog.
  // SYSTEM_OWNER-only per RBAC guard on this page + the DELETE API.
  const [deleteTarget, setDeleteTarget] = useState<Donor | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    donorType: "",
    countryOfOrigin: "",
    website: "",
    active: true,
    sortOrder: 0,
  });

  useEffect(() => {
    if (!authLoading && !isSystemOwner) {
      router.replace("/dashboard");
    }
  }, [authLoading, isSystemOwner, router]);

  const fetchDonors = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reference/donors?activeOnly=false");
      if (!res.ok) throw new Error("Failed to load donors");
      const data = await res.json();
      setDonors(data.donors || []);
    } catch (err) {
      setError("Unable to load donors. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSystemOwner) {
      fetchDonors();
    }
  }, [isSystemOwner]);

  const resetForm = () => {
    setFormData({
      name: "",
      donorType: "",
      countryOfOrigin: "",
      website: "",
      active: true,
      sortOrder: 0,
    });
    setEditing(null);
  };

  const openDialog = (donor?: Donor) => {
    if (donor) {
      setEditing(donor);
      setFormData({
        name: donor.name,
        donorType: donor.donorType || "",
        countryOfOrigin: donor.countryOfOrigin || "",
        website: donor.website || "",
        active: donor.active,
        sortOrder: donor.sortOrder,
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
      const url = editing
        ? `/api/reference/donors/${editing.id}`
        : "/api/reference/donors";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save");
      }
      toast.success(editing ? "Donor updated" : "Donor created");
      setDialogOpen(false);
      resetForm();
      fetchDonors();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (donor: Donor) => {
    try {
      const res = await fetch(`/api/reference/donors/${donor.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !donor.active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update");
      toast.success(donor.active ? "Deactivated" : "Activated");
      fetchDonors();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
  };

  const filtered = donors.filter((d) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      (d.donorType || "").toLowerCase().includes(q) ||
      (d.countryOfOrigin || "").toLowerCase().includes(q)
    );
  });

  if (authLoading || !isSystemOwner) return null;

  return (
    <div data-design-id="cms-donors-page" className="p-8">
      <div
        data-design-id="cms-donors-header"
        className="flex items-center justify-between mb-6"
      >
        <div className="flex items-center">
          <Link href="/dashboard/cms">
            <Button variant="ghost" size="sm" className="mr-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Donors</h1>
            <p className="text-slate-600">
              Manage donor / funder reference data used across projects and
              reports.
            </p>
          </div>
        </div>
        <Button
          onClick={() => openDialog()}
          data-design-id="cms-donors-add"
          className="bg-sky-600 hover:bg-sky-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Donor
        </Button>
      </div>

      <Card data-design-id="cms-donors-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Donors</CardTitle>
              <CardDescription>{filtered.length} records</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search donors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && <LoadingState message="Loading..." />}
          {error && <ErrorState message={error} onRetry={fetchDonors} />}
          {!loading && !error && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Country of Origin</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow
                    key={d.id}
                    data-design-id={`donor-row-${d.id}`}
                  >
                    <TableCell className="font-medium flex items-center gap-2">
                      <HandCoins className="w-4 h-4 text-slate-400" />
                      {d.name}
                    </TableCell>
                    <TableCell>
                      {d.donorType ? (
                        <Badge variant="outline">{d.donorType}</Badge>
                      ) : (
                        <span className="text-slate-400 text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {d.countryOfOrigin || (
                        <span className="text-slate-400 text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {d.website ? (
                        <a
                          href={d.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-600 hover:text-sky-700 text-sm inline-flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Link
                        </a>
                      ) : (
                        <span className="text-slate-400 text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>{d.sortOrder}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          d.active
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-slate-50 text-slate-700"
                        }
                      >
                        {d.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleActive(d)}
                      >
                        {d.active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDialog(d)}
                        data-design-id={`donor-edit-${d.id}`}
                        title="Edit donor"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(d)}
                        data-design-id={`donor-delete-${d.id}`}
                        title="Delete donor"
                        className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
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
        <DialogContent data-design-id="donor-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Donor" : "Add Donor"}</DialogTitle>
            <DialogDescription>
              Donors are global reference data. Project records link to a donor
              by id.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                  placeholder="USAID"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="donorType">Donor Type</Label>
                  <Select
                    value={formData.donorType || "_none"}
                    onValueChange={(v) =>
                      setFormData({
                        ...formData,
                        donorType: v === "_none" ? "" : v,
                      })
                    }
                  >
                    <SelectTrigger id="donorType">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">—</SelectItem>
                      {DONOR_TYPE_OPTIONS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="countryOfOrigin">
                    Country of Origin (code)
                  </Label>
                  <Input
                    id="countryOfOrigin"
                    value={formData.countryOfOrigin}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        countryOfOrigin: e.target.value.toUpperCase(),
                      })
                    }
                    placeholder="US"
                    maxLength={2}
                  />
                </div>
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
                  placeholder="https://example.org"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="sortOrder">Sort Order</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      sortOrder: Number.parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="active"
                  checked={formData.active}
                  onCheckedChange={(c) =>
                    setFormData({ ...formData, active: c })
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
                {saving ? "Saving..." : editing ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/*
        Destructive-confirmation dialog for donor delete.
        Blocked with project counts (see src/lib/reference-delete.ts) when
        the donor is still linked to one or more projects.
      */}
      <DeleteReferenceDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        kindLabel="donor"
        name={deleteTarget?.name ?? ""}
        deleteUrl={
          deleteTarget ? `/api/reference/donors/${deleteTarget.id}` : ""
        }
        designId="donor-delete-dialog"
        onSuccess={() => {
          setDeleteTarget(null);
          fetchDonors();
        }}
      />
    </div>
  );
}