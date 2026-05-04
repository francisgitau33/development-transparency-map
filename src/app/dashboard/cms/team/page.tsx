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
import { Textarea } from "@/components/ui/textarea";
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
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  UserCircle2,
  Eye,
  Users,
} from "lucide-react";

interface TeamMember {
  id: string;
  name: string;
  role: string;
  bio: string | null;
  photoUrl: string | null;
  linkedinUrl: string | null;
  displayOrder: number;
  active: boolean;
}

interface FormState {
  name: string;
  role: string;
  bio: string;
  photoUrl: string;
  linkedinUrl: string;
  displayOrder: string;
  active: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  role: "",
  bio: "",
  photoUrl: "",
  linkedinUrl: "",
  displayOrder: "0",
  active: true,
};

export default function TeamCMSPage() {
  const router = useRouter();
  const { isSystemOwner, isLoading: authLoading } = useAuth();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);

  const [deleteMember, setDeleteMember] = useState<TeamMember | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!authLoading && !isSystemOwner) {
      router.replace("/dashboard");
    }
  }, [authLoading, isSystemOwner, router]);

  const fetchMembers = async () => {
    setLoading(true);
    setError(null);
    try {
      // `?all=true` returns inactive rows too — only honored for
      // SYSTEM_OWNER by the server.
      const res = await fetch("/api/team?all=true");
      if (!res.ok) throw new Error("Failed to load team members");
      const data = await res.json();
      setMembers(Array.isArray(data.members) ? data.members : []);
    } catch (_err) {
      setError("Unable to load team members. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSystemOwner) fetchMembers();
  }, [isSystemOwner]);

  const resetForm = () => {
    setFormData({ ...EMPTY_FORM });
    setEditing(null);
  };

  const openDialog = (member?: TeamMember) => {
    if (member) {
      setEditing(member);
      setFormData({
        name: member.name,
        role: member.role,
        bio: member.bio || "",
        photoUrl: member.photoUrl || "",
        linkedinUrl: member.linkedinUrl || "",
        displayOrder: String(member.displayOrder),
        active: member.active,
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
      const url = editing ? `/api/team/${editing.id}` : "/api/team";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          role: formData.role,
          bio: formData.bio,
          photoUrl: formData.photoUrl,
          linkedinUrl: formData.linkedinUrl,
          displayOrder: Number(formData.displayOrder) || 0,
          active: formData.active,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = Array.isArray(data.details)
          ? `: ${data.details.join("; ")}`
          : "";
        throw new Error(
          `${data.error || (editing ? "Failed to update team member" : "Failed to create team member")}${detail}`,
        );
      }
      toast.success(
        editing
          ? "Team member updated successfully"
          : "Team member added successfully",
      );
      setDialogOpen(false);
      resetForm();
      await fetchMembers();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : editing
            ? "Failed to update team member"
            : "Failed to create team member",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteMember) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/team/${deleteMember.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete team member");
      }
      toast.success(`Removed "${deleteMember.name}" from the team`);
      setDeleteMember(null);
      await fetchMembers();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete team member",
      );
    } finally {
      setDeleting(false);
    }
  };

  if (authLoading || !isSystemOwner) return null;

  return (
    <div data-design-id="cms-team-page" className="p-8">
      <Link
        href="/dashboard/cms"
        className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to CMS
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Our Team</h1>
          <p className="text-slate-600">
            Manage the people shown on the public{" "}
            <Link href="/team" className="text-sky-600 hover:underline">
              /team
            </Link>{" "}
            page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/team" target="_blank" rel="noopener noreferrer">
            <Button variant="outline">
              <Eye className="w-4 h-4 mr-2" />
              View public page
            </Button>
          </Link>
          <Button
            onClick={() => openDialog()}
            className="bg-sky-600 hover:bg-sky-700"
            data-design-id="cms-team-add"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Team Member
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Team members</CardTitle>
          <CardDescription>
            {members.length} total · drag order not required — use the
            Display order field (lower numbers appear first).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && <LoadingState message="Loading team..." />}
          {error && <ErrorState message={error} onRetry={fetchMembers} />}
          {!loading && !error && members.length === 0 && (
            <EmptyState
              icon={<Users className="w-8 h-8 text-slate-400" />}
              title="No team members yet"
              description="Add the first team member to populate the public Our Team page."
              action={
                <Button
                  onClick={() => openDialog()}
                  className="bg-sky-600 hover:bg-sky-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Team Member
                </Button>
              }
            />
          )}
          {!loading && !error && members.length > 0 && (
            <ul className="space-y-3" data-design-id="cms-team-list">
              {members.map((m) => (
                <li
                  key={m.id}
                  data-design-id={`cms-team-row-${m.id}`}
                  className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3"
                >
                  <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                    {m.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.photoUrl}
                        alt={m.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display =
                            "none";
                        }}
                      />
                    ) : (
                      <UserCircle2 className="w-8 h-8 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900 truncate">
                        {m.name}
                      </span>
                      {!m.active && (
                        <Badge
                          variant="outline"
                          className="bg-slate-50 text-slate-600"
                        >
                          Hidden
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-slate-600 truncate">
                      {m.role}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Display order: {m.displayOrder}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openDialog(m)}
                      aria-label={`Edit ${m.name}`}
                      data-design-id={`cms-team-edit-${m.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteMember(m)}
                      aria-label={`Delete ${m.name}`}
                      data-design-id={`cms-team-delete-${m.id}`}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit team member" : "Add team member"}
            </DialogTitle>
            <DialogDescription>
              Fields marked * are required. The photo is stored as a URL —
              paste an https:// link to a hosted image (any standard image
              format). Leave blank for a placeholder silhouette.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="team-name">Name *</Label>
                <Input
                  id="team-name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  maxLength={160}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="team-role">Role / Title *</Label>
                <Input
                  id="team-role"
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({ ...formData, role: e.target.value })
                  }
                  maxLength={160}
                  placeholder="e.g. Executive Director"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="team-photo">Photo URL</Label>
                <Input
                  id="team-photo"
                  value={formData.photoUrl}
                  onChange={(e) =>
                    setFormData({ ...formData, photoUrl: e.target.value })
                  }
                  maxLength={2048}
                  placeholder="https://..."
                  inputMode="url"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="team-linkedin">LinkedIn URL</Label>
                <Input
                  id="team-linkedin"
                  value={formData.linkedinUrl}
                  onChange={(e) =>
                    setFormData({ ...formData, linkedinUrl: e.target.value })
                  }
                  maxLength={2048}
                  placeholder="https://www.linkedin.com/in/..."
                  inputMode="url"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="team-bio">Biography</Label>
                <Textarea
                  id="team-bio"
                  value={formData.bio}
                  onChange={(e) =>
                    setFormData({ ...formData, bio: e.target.value })
                  }
                  maxLength={4000}
                  rows={5}
                  placeholder="Short biography shown on the public page."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="team-order">Display order</Label>
                  <Input
                    id="team-order"
                    type="number"
                    min={0}
                    step={1}
                    value={formData.displayOrder}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        displayOrder: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border border-slate-200 px-3">
                  <Label htmlFor="team-active" className="cursor-pointer">
                    Published
                  </Label>
                  <Switch
                    id="team-active"
                    checked={formData.active}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, active: checked })
                    }
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-sky-600 hover:bg-sky-700"
              >
                {saving
                  ? editing
                    ? "Saving..."
                    : "Adding..."
                  : editing
                    ? "Save Changes"
                    : "Add Team Member"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={deleteMember !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteMember(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove team member?</DialogTitle>
            <DialogDescription>
              This permanently removes{" "}
              <span className="font-medium text-slate-900">
                {deleteMember?.name}
              </span>{" "}
              from the platform. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteMember(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? "Removing..." : "Remove Team Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}