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
  /** Legacy external-URL photo (pre-upload feature). */
  photoUrl: string | null;
  /** True when this row has uploaded bytes servable at /api/team/:id/photo. */
  hasPhoto: boolean;
  photoMimeType: string | null;
  linkedinUrl: string | null;
  displayOrder: number;
  active: boolean;
  /** Server-issued timestamp; used as a cache-buster in image URLs. */
  updatedAt: string;
}

/**
 * Build a cache-busting src for the photo endpoint. The endpoint sets a
 * 5-minute cache, so without this query-string the browser would keep
 * showing the old photo for a short window after a successful edit.
 */
function photoSrc(member: Pick<TeamMember, "id" | "updatedAt">) {
  const v = encodeURIComponent(member.updatedAt ?? "");
  return `/api/team/${member.id}/photo${v ? `?v=${v}` : ""}`;
}

/**
 * Photo-upload client-side limits. Kept in sync with server-side limits
 * in src/lib/validation.ts (TEAM_MEMBER_PHOTO_MAX_BYTES,
 * TEAM_MEMBER_PHOTO_MIME_TYPES). The server is the source of truth —
 * the client simply fails fast for an obviously bad file before we
 * waste a round-trip.
 */
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const PHOTO_ACCEPT = "image/jpeg,image/jpg,image/png";
const ALLOWED_MIME = new Set(["image/jpeg", "image/png"]);
const ALLOWED_EXT = /\.(jpe?g|png)$/i;

interface PhotoSelection {
  /** The raw base64 body (data URL stripped). */
  base64: string;
  /** The server-trusted MIME derived from magic bytes is enforced on
   *  the server. Here we just send what the browser reported. */
  mimeType: string;
  /** Object URL for in-modal preview. Revoked on close / replace. */
  previewUrl: string;
  /** Decoded size for display. */
  sizeBytes: number;
  /** Source file name for display. */
  fileName: string;
}

interface FormState {
  name: string;
  role: string;
  bio: string;
  linkedinUrl: string;
  displayOrder: string;
  active: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  role: "",
  bio: "",
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

  // Photo upload state for the modal.
  //   - `photo` holds the pending replacement (null → keep existing when
  //     editing, or no photo at all when adding a new member).
  //   - `photoError` renders the inline validation message.
  const [photo, setPhoto] = useState<PhotoSelection | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

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
    // Always clear the pending photo when the modal closes; its object
    // URL is revoked in the dialog open handler below.
    setPhoto(null);
    setPhotoError(null);
  };

  const openDialog = (member?: TeamMember) => {
    // Revoke any stale object URL from a previous session of the modal.
    if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl);
    setPhoto(null);
    setPhotoError(null);

    if (member) {
      setEditing(member);
      setFormData({
        name: member.name,
        role: member.role,
        bio: member.bio || "",
        linkedinUrl: member.linkedinUrl || "",
        displayOrder: String(member.displayOrder),
        active: member.active,
      });
    } else {
      setFormData({ ...EMPTY_FORM });
      setEditing(null);
    }
    setDialogOpen(true);
  };

  /**
   * Handle a newly-selected file from the Upload Photo control.
   * Validates client-side (MIME, extension, size) and reads the file as
   * base64 for the submit payload. The server still re-validates MIME
   * via magic-byte sniffing — this is fail-fast UX, not security.
   */
  const handlePhotoSelected = (file: File | null | undefined) => {
    // Revoke the previous preview before replacing or clearing.
    if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl);

    if (!file) {
      setPhoto(null);
      setPhotoError(null);
      return;
    }

    const mime = (file.type || "").toLowerCase();
    if (!ALLOWED_MIME.has(mime) || !ALLOWED_EXT.test(file.name)) {
      setPhoto(null);
      setPhotoError("Please upload a JPEG or PNG image.");
      return;
    }
    if (file.size === 0) {
      setPhoto(null);
      setPhotoError("The selected file is empty.");
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setPhoto(null);
      setPhotoError("The selected file is too large.");
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      setPhoto(null);
      setPhotoError("Photo upload failed. Please try again.");
    };
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        setPhoto(null);
        setPhotoError("Photo upload failed. Please try again.");
        return;
      }
      // FileReader.readAsDataURL → "data:image/png;base64,AAA..."
      const match = /^data:[^;]+;base64,(.+)$/.exec(result);
      if (!match || !match[1]) {
        setPhoto(null);
        setPhotoError("Photo upload failed. Please try again.");
        return;
      }
      const previewUrl = URL.createObjectURL(file);
      setPhoto({
        base64: match[1],
        mimeType: mime,
        previewUrl,
        sizeBytes: file.size,
        fileName: file.name,
      });
      setPhotoError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Photo required on create. On edit, existing photos (uploaded OR
    // legacy URL) are acceptable — the user may leave the file input
    // alone to keep the current image.
    if (!editing && !photo) {
      setPhotoError("Photo is required.");
      toast.error("Photo is required.");
      return;
    }

    setSaving(true);
    try {
      const url = editing ? `/api/team/${editing.id}` : "/api/team";
      const method = editing ? "PUT" : "POST";
      const payload: Record<string, unknown> = {
        name: formData.name,
        role: formData.role,
        bio: formData.bio,
        linkedinUrl: formData.linkedinUrl,
        displayOrder: Number(formData.displayOrder) || 0,
        active: formData.active,
      };
      // Only send photo fields when we actually have a replacement.
      // Omitting them on edit tells the server to keep the existing
      // uploaded photo untouched.
      if (photo) {
        payload.photoBase64 = photo.base64;
        payload.photoMimeType = photo.mimeType;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
                    {m.hasPhoto ? (
                      // Uploaded bytes — served from the dedicated
                      // endpoint. updatedAt acts as a cache buster when
                      // the photo is replaced in-place.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoSrc(m)}
                        alt={m.name}
                        className="w-full h-full object-cover"
                      />
                    ) : m.photoUrl ? (
                      // Legacy external URL fallback.
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
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            // Revoke any outstanding preview object URL so we don't leak.
            if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit team member" : "Add team member"}
            </DialogTitle>
            <DialogDescription>
              Fields marked * are required. Upload a JPEG or PNG photo —
              it is stored with the team member record and shown on the
              public Our Team page.
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
                <Label htmlFor="team-photo-file">
                  Upload Photo{editing ? "" : " *"}
                </Label>
                <div
                  data-design-id="team-photo-upload"
                  className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 flex items-start gap-4"
                >
                  <div
                    data-design-id="team-photo-preview"
                    aria-label="Photo Preview"
                    className="w-24 h-24 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0"
                  >
                    {photo ? (
                      // Newly-chosen file, preview via object URL.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photo.previewUrl}
                        alt="Photo preview"
                        className="w-full h-full object-cover"
                      />
                    ) : editing?.hasPhoto ? (
                      // Existing uploaded photo — cache-bust on updatedAt
                      // so a successful replace refreshes immediately.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoSrc(editing)}
                        alt="Current photo"
                        className="w-full h-full object-cover"
                      />
                    ) : editing?.photoUrl ? (
                      // Legacy external-URL photo on this record.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={editing.photoUrl}
                        alt="Current photo"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display =
                            "none";
                        }}
                      />
                    ) : (
                      <UserCircle2 className="w-10 h-10 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <input
                      id="team-photo-file"
                      type="file"
                      accept={PHOTO_ACCEPT}
                      data-design-id="team-photo-file-input"
                      onChange={(e) =>
                        handlePhotoSelected(e.target.files?.[0])
                      }
                      className="block w-full text-sm text-slate-700 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-sky-600 file:text-white hover:file:bg-sky-700 file:cursor-pointer"
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      JPEG or PNG only. Max 2 MB.
                    </p>
                    {photo && (
                      <p className="text-xs text-slate-600 mt-1 truncate">
                        Selected: {photo.fileName} ·{" "}
                        {Math.round(photo.sizeBytes / 1024)} KB
                      </p>
                    )}
                    {!photo &&
                      editing &&
                      (editing.hasPhoto || editing.photoUrl) && (
                        <p className="text-xs text-slate-500 mt-1">
                          Keep current photo — or choose a new file to
                          replace it.
                        </p>
                      )}
                    {photoError && (
                      <p
                        data-design-id="team-photo-error"
                        className="text-xs text-red-600 mt-2"
                        role="alert"
                      >
                        {photoError}
                      </p>
                    )}
                  </div>
                </div>
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