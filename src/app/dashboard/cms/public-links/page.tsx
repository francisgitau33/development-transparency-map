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
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { ArrowLeft, Save, Mail } from "lucide-react";
import { LinkedinIcon } from "@/components/public/icons/LinkedinIcon";
import { MediumIcon } from "@/components/public/icons/MediumIcon";

/**
 * CMS editor for the public footer links (LinkedIn, Medium, contact
 * email). SYSTEM_OWNER-only. All fields are optional — blanks simply
 * hide the corresponding element on the public pages.
 */

function isValidHttpsUrl(raw: string): boolean {
  const v = raw.trim();
  if (v.length === 0) return true;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.hostname.length > 0;
  } catch {
    return false;
  }
}

function isValidEmail(raw: string): boolean {
  const v = raw.trim();
  if (v.length === 0) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export default function CmsPublicLinksPage() {
  const router = useRouter();
  const { isSystemOwner, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [mediumUrl, setMediumUrl] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  useEffect(() => {
    if (!authLoading && !isSystemOwner) {
      router.replace("/dashboard");
    }
  }, [authLoading, isSystemOwner, router]);

  const fetchLinks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cms/public-links", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load links");
      const data = await res.json();
      const l = (data.links ?? {}) as {
        linkedinUrl?: string | null;
        mediumUrl?: string | null;
        contactEmail?: string | null;
      };
      setLinkedinUrl(l.linkedinUrl ?? "");
      setMediumUrl(l.mediumUrl ?? "");
      setContactEmail(l.contactEmail ?? "");
    } catch {
      setError("Unable to load public links. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSystemOwner) fetchLinks();
  }, [isSystemOwner]);

  const clientErrors: string[] = [];
  if (!isValidHttpsUrl(linkedinUrl)) {
    clientErrors.push("LinkedIn URL must start with https://");
  }
  if (!isValidHttpsUrl(mediumUrl)) {
    clientErrors.push("Medium URL must start with https://");
  }
  if (!isValidEmail(contactEmail)) {
    clientErrors.push("Contact email must be a valid email address");
  }

  const handleSave = async () => {
    if (clientErrors.length > 0) {
      toast.error(clientErrors[0]);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/cms/public-links", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedinUrl, mediumUrl, contactEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail =
          Array.isArray(data?.details) && data.details.length > 0
            ? data.details[0]
            : (data?.error as string) || "Failed to save links";
        toast.error(detail);
        return;
      }
      toast.success("Public links updated");
      fetchLinks();
    } catch {
      toast.error("Failed to save links");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !isSystemOwner) return null;

  return (
    <div data-design-id="cms-public-links-page" className="p-8">
      <div
        data-design-id="cms-public-links-header"
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
              data-design-id="cms-public-links-title"
              className="text-2xl font-bold text-slate-900"
            >
              Public Links
            </h1>
            <p
              data-design-id="cms-public-links-subtitle"
              className="text-slate-600"
            >
              Configure the social links and contact email shown in the public
              footer
            </p>
          </div>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving || clientErrors.length > 0}
          className="bg-sky-600 hover:bg-sky-700"
          data-design-id="cms-public-links-save"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {loading && <LoadingState message="Loading links..." />}
      {error && <ErrorState message={error} onRetry={fetchLinks} />}

      {!loading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <Card data-design-id="cms-public-links-social-card">
              <CardHeader>
                <CardTitle>Social Media</CardTitle>
                <CardDescription>
                  Optional. Leave blank to hide an icon from the public
                  footer. URLs must be absolute and begin with
                  <code> https:// </code>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label
                    htmlFor="linkedinUrl"
                    className="flex items-center gap-2"
                  >
                    <LinkedinIcon className="w-4 h-4 text-slate-600" />
                    LinkedIn URL
                  </Label>
                  <Input
                    id="linkedinUrl"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    placeholder="https://www.linkedin.com/company/…"
                    maxLength={500}
                  />
                </div>
                <div className="grid gap-2">
                  <Label
                    htmlFor="mediumUrl"
                    className="flex items-center gap-2"
                  >
                    <MediumIcon className="w-4 h-4 text-slate-600" />
                    Medium URL
                  </Label>
                  <Input
                    id="mediumUrl"
                    value={mediumUrl}
                    onChange={(e) => setMediumUrl(e.target.value)}
                    placeholder="https://medium.com/@…"
                    maxLength={500}
                  />
                </div>
              </CardContent>
            </Card>

            <Card data-design-id="cms-public-links-contact-card">
              <CardHeader>
                <CardTitle>Contact</CardTitle>
                <CardDescription>
                  Optional. Rendered in the footer as
                  <code> Contact: you@example.org </code> with a
                  <code> mailto: </code> link.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label
                    htmlFor="contactEmail"
                    className="flex items-center gap-2"
                  >
                    <Mail className="w-4 h-4 text-slate-600" />
                    Contact email
                  </Label>
                  <Input
                    id="contactEmail"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="hello@developmenttransparencymap.org"
                    maxLength={254}
                    type="email"
                  />
                </div>
              </CardContent>
            </Card>

            {clientErrors.length > 0 && (
              <Card
                data-design-id="cms-public-links-errors"
                className="border-red-200 bg-red-50"
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-red-700 text-base">
                    Please fix the following before saving
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                    {clientErrors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>

          <Card data-design-id="cms-public-links-preview-card">
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>
                Approximation of how the footer will render publicly. Blank
                fields are hidden.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg p-6 bg-slate-900 text-white text-center">
                <p className="text-base font-semibold mb-1">
                  Development Transparency Map
                </p>
                <p className="text-slate-400 text-sm mb-4">
                  Mapping Development. Enabling Transparency.
                </p>
                {(linkedinUrl.trim() || mediumUrl.trim()) && (
                  <div className="flex items-center justify-center gap-4 mb-3">
                    {linkedinUrl.trim() && (
                      <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-slate-800 text-slate-300">
                        <LinkedinIcon className="w-4 h-4" />
                      </span>
                    )}
                    {mediumUrl.trim() && (
                      <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-slate-800 text-slate-300">
                        <MediumIcon className="w-4 h-4" />
                      </span>
                    )}
                  </div>
                )}
                {contactEmail.trim() && (
                  <p className="text-sm text-slate-300">
                    Contact:{" "}
                    <span className="text-sky-300">
                      {contactEmail.trim()}
                    </span>
                  </p>
                )}
                {!linkedinUrl.trim() &&
                  !mediumUrl.trim() &&
                  !contactEmail.trim() && (
                    <p className="text-xs text-slate-500 italic mt-2">
                      No icons or contact will be shown.
                    </p>
                  )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}