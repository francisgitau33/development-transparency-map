"use client";

import { useEffect, useMemo, useState } from "react";
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
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Plus, ArrowLeft, Pencil, Map as MapIcon, Search } from "lucide-react";

interface Country {
  code: string;
  name: string;
  active: boolean;
}

interface AdministrativeArea {
  id: string;
  name: string;
  type: string | null;
  countryCode: string;
  active: boolean;
  sortOrder: number;
  // Optional population metadata. All fields may be null — the server
  // accepts missing values and the table renders "—" in that case.
  estimatedPopulation: number | null;
  populationYear: number | null;
  populationSource: string | null;
  populationSourceUrl: string | null;
  populationNotes: string | null;
}

// Population form state uses strings so empty inputs survive round-trips
// (a controlled <Input value={number}/> would clamp to 0, which the schema
// rejects). The submit handler converts these to numbers / null.
interface AdministrativeAreaForm {
  name: string;
  type: string;
  countryCode: string;
  active: boolean;
  sortOrder: number;
  estimatedPopulationStr: string;
  populationYearStr: string;
  populationSource: string;
  populationSourceUrl: string;
  populationNotes: string;
}

const TYPE_OPTIONS = [
  "District",
  "County",
  "Region",
  "Province",
  "State",
  "Municipality",
  "Subcounty",
  "Division",
  "Ward",
  "Other",
];

export default function AdministrativeAreasCMSPage() {
  const router = useRouter();
  const { isSystemOwner, isLoading: authLoading } = useAuth();
  const [areas, setAreas] = useState<AdministrativeArea[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState<string>("_all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdministrativeArea | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState<AdministrativeAreaForm>({
    name: "",
    type: "District",
    countryCode: "",
    active: true,
    sortOrder: 0,
    estimatedPopulationStr: "",
    populationYearStr: "",
    populationSource: "",
    populationSourceUrl: "",
    populationNotes: "",
  });

  useEffect(() => {
    if (!authLoading && !isSystemOwner) {
      router.replace("/dashboard");
    }
  }, [authLoading, isSystemOwner, router]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [areasRes, countriesRes] = await Promise.all([
        // Pass activeOnly=false so system owners see deactivated rows too.
        fetch("/api/reference/administrative-areas?activeOnly=false"),
        fetch("/api/reference/countries?activeOnly=true"),
      ]);
      if (!areasRes.ok || !countriesRes.ok) {
        throw new Error("Failed to load");
      }
      const [areasData, countriesData] = await Promise.all([
        areasRes.json(),
        countriesRes.json(),
      ]);
      setAreas(areasData.administrativeAreas || []);
      setCountries(countriesData.countries || []);
    } catch (err) {
      setError("Unable to load administrative areas. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSystemOwner) {
      fetchData();
    }
  }, [isSystemOwner]);

  const resetForm = () => {
    setFormData({
      name: "",
      type: "District",
      countryCode: countries[0]?.code || "",
      active: true,
      sortOrder: 0,
      estimatedPopulationStr: "",
      populationYearStr: "",
      populationSource: "",
      populationSourceUrl: "",
      populationNotes: "",
    });
    setEditing(null);
  };

  const openDialog = (area?: AdministrativeArea) => {
    if (area) {
      setEditing(area);
      setFormData({
        name: area.name,
        type: area.type || "",
        countryCode: area.countryCode,
        active: area.active,
        sortOrder: area.sortOrder,
        estimatedPopulationStr:
          area.estimatedPopulation !== null &&
          area.estimatedPopulation !== undefined
            ? String(area.estimatedPopulation)
            : "",
        populationYearStr:
          area.populationYear !== null && area.populationYear !== undefined
            ? String(area.populationYear)
            : "",
        populationSource: area.populationSource ?? "",
        populationSourceUrl: area.populationSourceUrl ?? "",
        populationNotes: area.populationNotes ?? "",
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
        ? `/api/reference/administrative-areas/${editing.id}`
        : "/api/reference/administrative-areas";
      const method = editing ? "PUT" : "POST";

      // Convert string-backed population inputs into the shape the API
      // validator expects. Empty string → null (field cleared). Numeric
      // strings go through as-is; the server rejects zero / non-positive
      // populations with a 400.
      const payload: Record<string, unknown> = {
        name: formData.name,
        type: formData.type,
        countryCode: formData.countryCode,
        active: formData.active,
        sortOrder: formData.sortOrder,
        estimatedPopulation:
          formData.estimatedPopulationStr.trim() === ""
            ? null
            : Number(formData.estimatedPopulationStr),
        populationYear:
          formData.populationYearStr.trim() === ""
            ? null
            : Number(formData.populationYearStr),
        populationSource:
          formData.populationSource.trim() === ""
            ? null
            : formData.populationSource.trim(),
        populationSourceUrl:
          formData.populationSourceUrl.trim() === ""
            ? null
            : formData.populationSourceUrl.trim(),
        populationNotes:
          formData.populationNotes.trim() === ""
            ? null
            : formData.populationNotes.trim(),
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save");
      }
      toast.success(
        editing ? "Administrative area updated" : "Administrative area created",
      );
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (area: AdministrativeArea) => {
    try {
      const res = await fetch(
        `/api/reference/administrative-areas/${area.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: !area.active }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update");
      }
      toast.success(area.active ? "Deactivated" : "Activated");
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
  };

  const countryNameByCode = useMemo(() => {
    const map = new Map(countries.map((c) => [c.code, c.name]));
    return (code: string) => map.get(code) || code;
  }, [countries]);

  const filtered = areas.filter((a) => {
    if (countryFilter !== "_all" && a.countryCode !== countryFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        (a.type || "").toLowerCase().includes(q) ||
        countryNameByCode(a.countryCode).toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (authLoading || !isSystemOwner) return null;

  return (
    <div data-design-id="cms-admin-areas-page" className="p-8">
      <div
        data-design-id="cms-admin-areas-header"
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
            <h1 className="text-2xl font-bold text-slate-900">
              Districts / Counties
            </h1>
            <p className="text-slate-600">
              Manage administrative areas (Districts, Counties, Regions, …) per
              country.
            </p>
          </div>
        </div>
        <Button
          onClick={() => openDialog()}
          data-design-id="cms-admin-areas-add"
          className="bg-sky-600 hover:bg-sky-700"
          disabled={countries.length === 0}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add District / County
        </Button>
      </div>

      <Card data-design-id="cms-admin-areas-card">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>All Districts / Counties</CardTitle>
              <CardDescription>{filtered.length} records</CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Select value={countryFilter} onValueChange={setCountryFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All countries" />
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
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && <LoadingState message="Loading..." />}
          {error && <ErrorState message={error} onRetry={fetchData} />}
          {!loading && !error && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Country</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Est. Population</TableHead>
                  <TableHead className="text-right">Year</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((area) => (
                  <TableRow
                    key={area.id}
                    data-design-id={`admin-area-row-${area.id}`}
                  >
                    <TableCell>{countryNameByCode(area.countryCode)}</TableCell>
                    <TableCell className="font-medium flex items-center gap-2">
                      <MapIcon className="w-4 h-4 text-slate-400" />
                      {area.name}
                    </TableCell>
                    <TableCell>
                      {area.type ? (
                        <Badge variant="outline">{area.type}</Badge>
                      ) : (
                        <span className="text-slate-400 text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {area.estimatedPopulation !== null &&
                      area.estimatedPopulation !== undefined ? (
                        area.estimatedPopulation.toLocaleString()
                      ) : (
                        <span className="text-slate-400 text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {area.populationYear ?? (
                        <span className="text-slate-400 text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className="max-w-[180px] truncate text-sm text-slate-600"
                      title={area.populationSource || undefined}
                    >
                      {area.populationSource || (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          area.active
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-slate-50 text-slate-700"
                        }
                      >
                        {area.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleActive(area)}
                      >
                        {area.active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDialog(area)}
                      >
                        <Pencil className="w-4 h-4" />
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
        <DialogContent data-design-id="admin-area-dialog">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit District / County" : "Add District / County"}
            </DialogTitle>
            <DialogDescription>
              Administrative areas are scoped to a country and used for project
              filtering and reporting.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="countryCode">Country *</Label>
                <Select
                  value={formData.countryCode}
                  onValueChange={(v) =>
                    setFormData({ ...formData, countryCode: v })
                  }
                >
                  <SelectTrigger id="countryCode">
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    required
                    placeholder="Nairobi County"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="type">Type</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(v) => setFormData({ ...formData, type: v })}
                  >
                    <SelectTrigger id="type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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

              {/* ---------------------------------------------------------- */}
              {/* Population metadata (all optional, used by population-      */}
              {/* weighted reports in /dashboard/reports).                    */}
              {/* ---------------------------------------------------------- */}
              <div className="pt-4 mt-2 border-t border-slate-200 space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Population (optional)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Used to calculate population-weighted reporting metrics.
                    Leave blank if unknown. Estimated population must be a
                    positive whole number; zero is not allowed.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="estimatedPopulation">
                      Estimated Population
                    </Label>
                    <Input
                      id="estimatedPopulation"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      placeholder="e.g. 1200000"
                      value={formData.estimatedPopulationStr}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          estimatedPopulationStr: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="populationYear">Population Year</Label>
                    <Input
                      id="populationYear"
                      type="number"
                      inputMode="numeric"
                      min={1900}
                      max={new Date().getUTCFullYear() + 1}
                      step={1}
                      placeholder="e.g. 2019"
                      value={formData.populationYearStr}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          populationYearStr: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="populationSource">Population Source</Label>
                  <Input
                    id="populationSource"
                    placeholder='e.g. "National Census 2019"'
                    value={formData.populationSource}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        populationSource: e.target.value,
                      })
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="populationSourceUrl">
                    Population Source URL
                  </Label>
                  <Input
                    id="populationSourceUrl"
                    type="url"
                    placeholder="https://…"
                    value={formData.populationSourceUrl}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        populationSourceUrl: e.target.value,
                      })
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="populationNotes">Population Notes</Label>
                  <Input
                    id="populationNotes"
                    placeholder="e.g. projection, includes informal settlements"
                    value={formData.populationNotes}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        populationNotes: e.target.value,
                      })
                    }
                  />
                </div>

                {formData.estimatedPopulationStr.trim() !== "" &&
                  (formData.populationYearStr.trim() === "" ||
                    formData.populationSource.trim() === "") && (
                    <p
                      data-design-id="admin-area-population-helper"
                      className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2"
                    >
                      Tip: recording the population year and source improves
                      the transparency of population-weighted reports.
                      Saving without them is allowed, but they will show as
                      incomplete in Data Quality.
                    </p>
                  )}
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
    </div>
  );
}