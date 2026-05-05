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
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { ArrowLeft, Save, Eye } from "lucide-react";

/**
 * CMS editor for the public Home page hero content.
 *
 * Behaviour:
 *   - SYSTEM_OWNER-only. Redirects PARTNER_ADMIN / anonymous back to
 *     /dashboard before rendering anything.
 *   - Loads the current CMS row (or BRANDING-backed defaults) from
 *     /api/cms/home, pre-fills the form, and saves via PUT.
 *   - Client-side validation mirrors the server-side validator for
 *     quick feedback. Server is still authoritative — any missed edge
 *     case is caught by the API.
 */

interface HomeContent {
  heroTitle: string;
  heroSubtitle: string;
  heroDescription: string | null;
  primaryCtaLabel: string | null;
  primaryCtaHref: string | null;
  secondaryCtaLabel: string | null;
  secondaryCtaHref: string | null;
}

function isValidCtaHref(raw: string): boolean {
  const v = raw.trim();
  if (v.length === 0) return true; // empty allowed; cross-field rule handled separately
  if (v.startsWith("/")) return true;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export default function CmsHomePage() {
  const router = useRouter();
  const { isSystemOwner, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [heroTitle, setHeroTitle] = useState("");
  const [heroSubtitle, setHeroSubtitle] = useState("");
  const [heroDescription, setHeroDescription] = useState("");
  const [primaryCtaLabel, setPrimaryCtaLabel] = useState("");
  const [primaryCtaHref, setPrimaryCtaHref] = useState("");
  const [secondaryCtaLabel, setSecondaryCtaLabel] = useState("");
  const [secondaryCtaHref, setSecondaryCtaHref] = useState("");

  useEffect(() => {
    if (!authLoading && !isSystemOwner) {
      router.replace("/dashboard");
    }
  }, [authLoading, isSystemOwner, router]);

  const fetchContent = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cms/home", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load content");
      const data = await res.json();
      const c = (data.content ?? {}) as Partial<HomeContent>;
      setHeroTitle(c.heroTitle ?? "");
      setHeroSubtitle(c.heroSubtitle ?? "");
      setHeroDescription(c.heroDescription ?? "");
      setPrimaryCtaLabel(c.primaryCtaLabel ?? "");
      setPrimaryCtaHref(c.primaryCtaHref ?? "");
      setSecondaryCtaLabel(c.secondaryCtaLabel ?? "");
      setSecondaryCtaHref(c.secondaryCtaHref ?? "");
    } catch {
      setError("Unable to load content. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSystemOwner) fetchContent();
  }, [isSystemOwner]);

  const clientErrors: string[] = [];
  if (!heroTitle.trim()) clientErrors.push("Hero title is required");
  if (!heroSubtitle.trim()) clientErrors.push("Hero subtitle is required");
  if (!isValidCtaHref(primaryCtaHref)) {
    clientErrors.push('Primary CTA link must start with "/" or be a valid http(s) URL');
  }
  if (!isValidCtaHref(secondaryCtaHref)) {
    clientErrors.push('Secondary CTA link must start with "/" or be a valid http(s) URL');
  }
  if (primaryCtaLabel.trim() && !primaryCtaHref.trim()) {
    clientErrors.push("Primary CTA link is required when a label is provided");
  }
  if (primaryCtaHref.trim() && !primaryCtaLabel.trim()) {
    clientErrors.push("Primary CTA label is required when a link is provided");
  }
  if (secondaryCtaLabel.trim() && !secondaryCtaHref.trim()) {
    clientErrors.push(
      "Secondary CTA link is required when a label is provided",
    );
  }
  if (secondaryCtaHref.trim() && !secondaryCtaLabel.trim()) {
    clientErrors.push(
      "Secondary CTA label is required when a link is provided",
    );
  }

  const handleSave = async () => {
    if (clientErrors.length > 0) {
      toast.error(clientErrors[0]);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/cms/home", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heroTitle,
          heroSubtitle,
          heroDescription,
          primaryCtaLabel,
          primaryCtaHref,
          secondaryCtaLabel,
          secondaryCtaHref,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail =
          Array.isArray(data?.details) && data.details.length > 0
            ? data.details[0]
            : (data?.error as string) || "Failed to save content";
        toast.error(detail);
        return;
      }
      toast.success("Home page content saved");
      fetchContent();
    } catch {
      toast.error("Failed to save content");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !isSystemOwner) return null;

  return (
    <div data-design-id="cms-home-page" className="p-8">
      <div
        data-design-id="cms-home-header"
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
              data-design-id="cms-home-title"
              className="text-2xl font-bold text-slate-900"
            >
              Home Page
            </h1>
            <p
              data-design-id="cms-home-subtitle"
              className="text-slate-600"
            >
              Edit the public homepage hero and call-to-action content
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Link href="/" target="_blank">
            <Button variant="outline">
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </Button>
          </Link>
          <Button
            onClick={handleSave}
            disabled={saving || clientErrors.length > 0}
            className="bg-sky-600 hover:bg-sky-700"
            data-design-id="cms-home-save"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {loading && <LoadingState message="Loading content..." />}
      {error && <ErrorState message={error} onRetry={fetchContent} />}

      {!loading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <Card data-design-id="cms-home-hero-card">
              <CardHeader>
                <CardTitle>Hero Section</CardTitle>
                <CardDescription>
                  The large headline visible when visitors first land on the
                  homepage.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="heroTitle">Hero title *</Label>
                  <Input
                    id="heroTitle"
                    value={heroTitle}
                    onChange={(e) => setHeroTitle(e.target.value)}
                    placeholder="Mapping Development. Enabling Transparency."
                    maxLength={200}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="heroSubtitle">Hero subtitle *</Label>
                  <Input
                    id="heroSubtitle"
                    value={heroSubtitle}
                    onChange={(e) => setHeroSubtitle(e.target.value)}
                    placeholder="See who is implementing what, where."
                    maxLength={240}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="heroDescription">Hero description</Label>
                  <Textarea
                    id="heroDescription"
                    value={heroDescription}
                    onChange={(e) => setHeroDescription(e.target.value)}
                    placeholder="A public geospatial platform for development projects worldwide."
                    rows={3}
                    maxLength={600}
                  />
                </div>
              </CardContent>
            </Card>

            <Card data-design-id="cms-home-cta-card">
              <CardHeader>
                <CardTitle>Call-to-Action Buttons</CardTitle>
                <CardDescription>
                  Leave both the label and link blank to hide a button. Links
                  may be site-relative (e.g. <code>/map</code>) or an absolute
                  http(s) URL.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="primaryCtaLabel">Primary CTA label</Label>
                  <Input
                    id="primaryCtaLabel"
                    value={primaryCtaLabel}
                    onChange={(e) => setPrimaryCtaLabel(e.target.value)}
                    placeholder="Explore the Map"
                    maxLength={60}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="primaryCtaHref">Primary CTA link</Label>
                  <Input
                    id="primaryCtaHref"
                    value={primaryCtaHref}
                    onChange={(e) => setPrimaryCtaHref(e.target.value)}
                    placeholder="/map or https://…"
                    maxLength={500}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="secondaryCtaLabel">
                    Secondary CTA label
                  </Label>
                  <Input
                    id="secondaryCtaLabel"
                    value={secondaryCtaLabel}
                    onChange={(e) => setSecondaryCtaLabel(e.target.value)}
                    placeholder="(optional) Learn More"
                    maxLength={60}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="secondaryCtaHref">Secondary CTA link</Label>
                  <Input
                    id="secondaryCtaHref"
                    value={secondaryCtaHref}
                    onChange={(e) => setSecondaryCtaHref(e.target.value)}
                    placeholder="/about or https://…"
                    maxLength={500}
                  />
                </div>
              </CardContent>
            </Card>

            {clientErrors.length > 0 && (
              <Card
                data-design-id="cms-home-errors"
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

          <Card data-design-id="cms-home-preview-card">
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>
                Approximation of how the hero will appear on the public home
                page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg p-8 bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 text-white text-center">
                <h2 className="text-2xl font-bold mb-4">
                  {heroTitle || "Hero title…"}
                </h2>
                <p className="text-lg text-sky-300 mb-3">
                  {heroSubtitle || "Hero subtitle…"}
                </p>
                {heroDescription && (
                  <p className="text-sm text-slate-300 mb-6">
                    {heroDescription}
                  </p>
                )}
                <div className="flex items-center justify-center gap-3">
                  {primaryCtaLabel && primaryCtaHref && (
                    <span className="inline-flex items-center px-5 py-2 bg-sky-500 rounded-lg text-sm font-semibold">
                      {primaryCtaLabel}
                    </span>
                  )}
                  {secondaryCtaLabel && secondaryCtaHref && (
                    <span className="inline-flex items-center px-5 py-2 bg-white/10 rounded-lg text-sm font-semibold">
                      {secondaryCtaLabel}
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}