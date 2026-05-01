"use client";

/**
 * Reusable destructive-confirmation dialog for the SYSTEM_OWNER reference
 * data delete flow (Reference Data Delete — PRD §9.x).
 *
 * The four CMS screens (Countries, Administrative Areas, Donors, Sectors)
 * all share the same delete shape:
 *
 *   1. Click a trash icon next to a row.
 *   2. Confirm with a destructive-styled modal that states
 *      "Delete <kind>: <name>?"
 *   3. DELETE /api/reference/<kind>/<id>.
 *   4. If the API returns 409 with `{ error, dependencies }`, render the
 *      blocked message plus a per-bucket list ("12 projects, 3 admin
 *      areas") inside the same modal so the user does not have to reopen
 *      it. The confirm button disappears and only "Close" remains.
 *   5. On success, a sonner toast is shown and the list is refreshed.
 *
 * This component encapsulates steps 2–4 so each CMS page only needs to
 * provide: the resource label, the target row's display name, the DELETE
 * URL, and an `onSuccess` callback.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface DeleteReferenceDialogProps {
  /** Controlled open state. */
  open: boolean;
  /** Called when the user dismisses the dialog. */
  onOpenChange: (open: boolean) => void;
  /**
   * Short singular label of the reference category, lower-cased.
   * Used in copy: "Delete <kindLabel>: <name>?" and the success toast.
   * Example: "country", "donor", "sector", "administrative area".
   */
  kindLabel: string;
  /** Display name of the record the user is deleting. */
  name: string;
  /**
   * Absolute API path to DELETE. No trailing slash. The component does not
   * URL-encode — the caller must pre-encode any dynamic segments.
   */
  deleteUrl: string;
  /** Optional short supplementary line under the main prompt. */
  note?: string;
  /** Called after a successful delete, before the dialog closes. */
  onSuccess: () => void;
  /**
   * Optional stable test id passed through to the outermost DialogContent.
   * Useful for e2e selectors per-category.
   */
  designId?: string;
}

interface Dependency {
  label: string;
  count: number;
}

export function DeleteReferenceDialog({
  open,
  onOpenChange,
  kindLabel,
  name,
  deleteUrl,
  note,
  onSuccess,
  designId,
}: DeleteReferenceDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [blockedDeps, setBlockedDeps] = useState<Dependency[]>([]);

  // Reset dialog state every time it re-opens so a previously-blocked
  // error from a different row does not leak into the fresh attempt.
  useEffect(() => {
    if (open) {
      setSubmitting(false);
      setBlockedMessage(null);
      setBlockedDeps([]);
    }
  }, [open]);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(deleteUrl, { method: "DELETE" });
      let data: {
        error?: string;
        dependencies?: Dependency[];
        ok?: boolean;
        mode?: string;
      } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        // Non-JSON response — fall through with empty object.
      }

      if (res.ok) {
        toast.success(
          `Deleted ${kindLabel} “${name}”. It is now hidden from public filters and upload forms.`,
        );
        onSuccess();
        onOpenChange(false);
        return;
      }

      if (res.status === 409) {
        setBlockedMessage(
          data.error ||
            `Cannot delete ${kindLabel} “${name}” because it is still in use.`,
        );
        setBlockedDeps(
          (data.dependencies || []).filter((d) => (d?.count ?? 0) > 0),
        );
        return;
      }

      if (res.status === 403) {
        toast.error(
          "Only System Owners can delete reference data. Please sign in with a System Owner account.",
        );
        onOpenChange(false);
        return;
      }

      if (res.status === 401) {
        toast.error("Your session has expired. Please sign in again.");
        onOpenChange(false);
        return;
      }

      throw new Error(
        data.error || `Failed to delete ${kindLabel}. Please try again.`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : `Failed to delete ${kindLabel}. Please try again.`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const isBlocked = blockedMessage !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-design-id={designId ?? "delete-reference-dialog"}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div
              className={
                isBlocked
                  ? "w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center shrink-0"
                  : "w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center shrink-0"
              }
            >
              {isBlocked ? (
                <ShieldAlert className="w-5 h-5 text-amber-600" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle>
                {isBlocked
                  ? `Cannot delete ${kindLabel}`
                  : `Delete ${kindLabel}: ${name}?`}
              </DialogTitle>
              <DialogDescription>
                {isBlocked
                  ? blockedMessage
                  : (note ??
                    `This will hide ${kindLabel} “${name}” from the public map, upload templates, and project forms. Existing historical records keep their link to this ${kindLabel}. This cannot be undone from the UI.`)}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isBlocked && blockedDeps.length > 0 && (
          <div
            data-design-id="delete-reference-dependencies"
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            <p className="font-medium mb-1">Linked records</p>
            <ul className="list-disc pl-5 space-y-0.5">
              {blockedDeps.map((d) => (
                <li key={d.label}>
                  {d.count} {d.label}
                </li>
              ))}
            </ul>
            <p className="text-xs text-amber-800/80 mt-2">
              Deactivate or reassign these records first, then try again. You
              can also deactivate this {kindLabel} to hide it without
              deleting.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            data-design-id="delete-reference-cancel"
          >
            {isBlocked ? "Close" : "Cancel"}
          </Button>
          {!isBlocked && (
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="bg-rose-600 hover:bg-rose-700 text-white"
              data-design-id="delete-reference-confirm"
            >
              {submitting ? "Deleting..." : "Confirm Delete"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}