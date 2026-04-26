"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { SectorIcon } from "@/components/shared/SectorIcon";
import { availableIconKeys, formatIconKeyForDisplay } from "@/lib/icons/sector-icons";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Plus, ArrowLeft, Pencil, Search } from "lucide-react";

interface Sector {
  key: string;
  name: string;
  icon: string;
  color: string;
  active: boolean;
  sortOrder: number;
}

export default function SectorsCMSPage() {
  const router = useRouter();
  const { isSystemOwner, isLoading: authLoading } = useAuth();
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSector, setEditingSector] = useState<Sector | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    key: "",
    name: "",
    icon: "layers",
    color: "#10b981",
    active: true,
    sortOrder: 0,
  });

  useEffect(() => {
    if (!authLoading && !isSystemOwner) {
      router.replace("/dashboard");
    }
  }, [authLoading, isSystemOwner, router]);

  const fetchSectors = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reference/sectors");
      if (!res.ok) throw new Error("Failed to load sectors");
      const data = await res.json();
      setSectors(data.sectors || []);
    } catch (err) {
      setError("Unable to load sectors. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSystemOwner) {
      fetchSectors();
    }
  }, [isSystemOwner]);

  const resetForm = () => {
    setFormData({
      key: "",
      name: "",
      icon: "layers",
      color: "#10b981",
      active: true,
      sortOrder: 0,
    });
    setEditingSector(null);
  };

  const openDialog = (sector?: Sector) => {
    if (sector) {
      setEditingSector(sector);
      setFormData({
        key: sector.key,
        name: sector.name,
        icon: sector.icon,
        color: sector.color,
        active: sector.active,
        sortOrder: sector.sortOrder,
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
      const method = editingSector ? "PUT" : "POST";
      const res = await fetch("/api/reference/sectors", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save sector");
      }

      toast.success(editingSector ? "Sector updated successfully" : "Sector created successfully");
      setDialogOpen(false);
      resetForm();
      fetchSectors();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save sector");
    } finally {
      setSaving(false);
    }
  };

  const filteredSectors = sectors.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.key.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (authLoading || !isSystemOwner) {
    return null;
  }

  return (
    <div data-design-id="cms-sectors-page" className="p-8">
      <div
        data-design-id="cms-sectors-header"
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
              data-design-id="cms-sectors-title"
              className="text-2xl font-bold text-slate-900"
            >
              Sectors
            </h1>
            <p
              data-design-id="cms-sectors-subtitle"
              className="text-slate-600"
            >
              Manage development sectors
            </p>
          </div>
        </div>
        <Button
          onClick={() => openDialog()}
          data-design-id="cms-sectors-add"
          className="bg-sky-600 hover:bg-sky-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Sector
        </Button>
      </div>

      <Card data-design-id="cms-sectors-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Sectors</CardTitle>
              <CardDescription>{filteredSectors.length} sectors</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search sectors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-design-id="cms-sectors-search"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && <LoadingState message="Loading sectors..." />}

          {error && <ErrorState message={error} onRetry={fetchSectors} />}

          {!loading && !error && (
            <Table data-design-id="cms-sectors-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Color</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Icon</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSectors.map((sector) => (
                  <TableRow key={sector.key} data-design-id={`sector-row-${sector.key}`}>
                    <TableCell>
                      <div
                        className="w-6 h-6 rounded-full"
                        style={{ backgroundColor: sector.color }}
                      />
                    </TableCell>
                    <TableCell className="font-mono">{sector.key}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <SectorIcon iconKey={sector.icon} color={sector.color} size="sm" />
                        {sector.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-slate-100 px-2 py-1 rounded">
                        {sector.icon}
                      </code>
                    </TableCell>
                    <TableCell>{sector.sortOrder}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          sector.active
                            ? "bg-sky-50 text-sky-700"
                            : "bg-slate-50 text-slate-700"
                        }
                      >
                        {sector.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDialog(sector)}
                        data-design-id={`sector-edit-${sector.key}`}
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
        <DialogContent data-design-id="sector-dialog">
          <DialogHeader>
            <DialogTitle>
              {editingSector ? "Edit Sector" : "Add Sector"}
            </DialogTitle>
            <DialogDescription>
              {editingSector
                ? "Update sector details"
                : "Add a new development sector"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="key">Sector Key *</Label>
                  <Input
                    id="key"
                    value={formData.key}
                    onChange={(e) => setFormData({ ...formData, key: e.target.value.toUpperCase() })}
                    required
                    placeholder="HEALTH"
                    disabled={!!editingSector}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="Health"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="icon">Icon *</Label>
                  <Select
                    value={formData.icon}
                    onValueChange={(value) => setFormData({ ...formData, icon: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select an icon">
                        <div className="flex items-center gap-2">
                          <SectorIcon iconKey={formData.icon} size="sm" />
                          <span>{formatIconKeyForDisplay(formData.icon)}</span>
                        </div>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {availableIconKeys.map((iconKey) => (
                        <SelectItem key={iconKey} value={iconKey}>
                          <div className="flex items-center gap-2">
                            <SectorIcon iconKey={iconKey} size="sm" />
                            <span>{formatIconKeyForDisplay(iconKey)}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="color">Color *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="color"
                      type="color"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      className="w-12 h-10 p-1"
                    />
                    <Input
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      placeholder="#10b981"
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="border rounded-lg p-4 bg-slate-50">
                <Label className="text-xs text-slate-500 mb-2 block">Preview</Label>
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: formData.color }}
                  >
                    <SectorIcon iconKey={formData.icon} color="#ffffff" size="md" />
                  </div>
                  <div>
                    <div className="font-medium">{formData.name || "Sector Name"}</div>
                    <code className="text-xs text-slate-500">{formData.key || "KEY"}</code>
                  </div>
                </div>
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
                {saving ? "Saving..." : editingSector ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}