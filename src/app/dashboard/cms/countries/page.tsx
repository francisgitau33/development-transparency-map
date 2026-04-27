"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import {
  Plus,
  ArrowLeft,
  Pencil,
  Globe,
  Search,
  BarChart3,
  Info,
} from "lucide-react";

interface Country {
  code: string;
  name: string;
  type: string;
  active: boolean;
  sortOrder: number;
}

export default function CountriesCMSPage() {
  const router = useRouter();
  const { isSystemOwner, isLoading: authLoading } = useAuth();
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCountry, setEditingCountry] = useState<Country | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    code: "",
    name: "",
    type: "COUNTRY",
    active: true,
    sortOrder: 0,
  });

  useEffect(() => {
    if (!authLoading && !isSystemOwner) {
      router.replace("/dashboard");
    }
  }, [authLoading, isSystemOwner, router]);

  const fetchCountries = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reference/countries");
      if (!res.ok) throw new Error("Failed to load countries");
      const data = await res.json();
      setCountries(data.countries || []);
    } catch (err) {
      setError("Unable to load countries. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSystemOwner) {
      fetchCountries();
    }
  }, [isSystemOwner]);

  const resetForm = () => {
    setFormData({
      code: "",
      name: "",
      type: "COUNTRY",
      active: true,
      sortOrder: 0,
    });
    setEditingCountry(null);
  };

  const openDialog = (country?: Country) => {
    if (country) {
      setEditingCountry(country);
      setFormData({
        code: country.code,
        name: country.name,
        type: country.type,
        active: country.active,
        sortOrder: country.sortOrder,
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
      const method = editingCountry ? "PUT" : "POST";
      const res = await fetch("/api/reference/countries", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save country");
      }

      // Two-step country-context flow (see Prompt 9 · Part D, Option 2):
      // After a brand-new country is created, route the System Owner
      // straight to the Development Context editor for that code. This
      // removes the previous gap where the Add Country modal only collected
      // base fields and the user had to discover the context screen
      // afterwards. Edit Country keeps its existing behaviour (close modal,
      // refresh table) so power-users can batch-edit base fields quickly.
      const createdCode = (
        (data?.country?.code as string | undefined) ?? formData.code
      )
        .trim()
        .toUpperCase();

      setDialogOpen(false);
      resetForm();

      if (editingCountry) {
        toast.success("Country updated successfully");
        fetchCountries();
      } else {
        toast.success(
          "Country created. Continue on the Development Context screen to add GDP per capita, HDI, poverty, and ODA indicators.",
        );
        if (createdCode) {
          router.push(`/dashboard/cms/countries/${createdCode}/context`);
        } else {
          fetchCountries();
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save country");
    } finally {
      setSaving(false);
    }
  };

  const filteredCountries = countries.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (authLoading || !isSystemOwner) {
    return null;
  }

  return (
    <div data-design-id="cms-countries-page" className="p-8">
      <div
        data-design-id="cms-countries-header"
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
            <h1
              data-design-id="cms-countries-title"
              className="text-2xl font-bold text-slate-900"
            >
              Countries
            </h1>
            <p
              data-design-id="cms-countries-subtitle"
              className="text-slate-600"
            >
              Manage reference countries and territories
            </p>
          </div>
        </div>
        <Button
          onClick={() => openDialog()}
          data-design-id="cms-countries-add"
          className="bg-sky-600 hover:bg-sky-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Country
        </Button>
      </div>

      <Card data-design-id="cms-countries-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Countries</CardTitle>
              <CardDescription>{filteredCountries.length} countries</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search countries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-design-id="cms-countries-search"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && <LoadingState message="Loading countries..." />}

          {error && <ErrorState message={error} onRetry={fetchCountries} />}

          {!loading && !error && (
            <Table data-design-id="cms-countries-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCountries.map((country) => (
                  <TableRow key={country.code} data-design-id={`country-row-${country.code}`}>
                    <TableCell className="font-mono">{country.code}</TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <Globe className="w-4 h-4 text-slate-400 mr-2" />
                        {country.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{country.type}</Badge>
                    </TableCell>
                    <TableCell>{country.sortOrder}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          country.active
                            ? "bg-sky-50 text-sky-700"
                            : "bg-slate-50 text-slate-700"
                        }
                      >
                        {country.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/dashboard/cms/countries/${country.code}/context`}
                          data-design-id={`country-context-${country.code}`}
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Manage Country Development Context"
                          >
                            <BarChart3 className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDialog(country)}
                          data-design-id={`country-edit-${country.code}`}
                          title="Edit country details"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-design-id="country-dialog">
          <DialogHeader>
            <DialogTitle>
              {editingCountry ? "Edit Country" : "Add Country"}
            </DialogTitle>
            <DialogDescription>
              {editingCountry
                ? "Update country details. Population is calculated from District / County records and cannot be edited here."
                : "Add a new country or territory. Development context indicators are added on the next screen."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              {!editingCountry && (
                <div
                  data-design-id="country-add-context-notice"
                  className="flex gap-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900"
                >
                  <Info className="w-4 h-4 mt-0.5 shrink-0 text-sky-600" />
                  <div>
                    <p className="font-medium">
                      After creating the country, you will be taken to the
                      Development Context screen.
                    </p>
                    <p className="text-xs text-sky-800/80 mt-0.5">
                      There you can enter GDP per capita, HDI score &amp; rank,
                      poverty rate, and ODA indicators (up to 5 years each).
                      Country population is calculated from District / County
                      records entered under Districts / Counties — it is not
                      manually set at country level.
                    </p>
                  </div>
                </div>
              )}

              {editingCountry && (
                <div
                  data-design-id="country-edit-context-link"
                  className="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                >
                  <div className="flex items-start gap-2">
                    <BarChart3 className="w-4 h-4 mt-0.5 shrink-0 text-sky-600" />
                    <div>
                      <p className="font-medium text-slate-900">
                        Development Context indicators
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        GDP per capita, HDI, poverty rate, and ODA are managed
                        on a dedicated screen.
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/dashboard/cms/countries/${editingCountry.code}/context`}
                    onClick={() => setDialogOpen(false)}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="whitespace-nowrap"
                    >
                      Manage context
                    </Button>
                  </Link>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="code">Country Code *</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    required
                    maxLength={2}
                    placeholder="US"
                    disabled={!!editingCountry}
                  />
                </div>
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
                      <SelectItem value="COUNTRY">Country</SelectItem>
                      <SelectItem value="TERRITORY">Territory</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="United States"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="sortOrder">Sort Order</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: Number.parseInt(e.target.value) || 0 })}
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
                className="bg-sky-600 hover:bg-sky-700"
              >
                {saving ? "Saving..." : editingCountry ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}