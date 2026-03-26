"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Save, Eye } from "lucide-react";

interface BodySection {
  type: string;
  content: string;
}

interface CMSContent {
  title: string;
  subtitle: string | null;
  bodySections: BodySection[];
}

export default function AboutCMSPage() {
  const router = useRouter();
  const { isSystemOwner, isLoading: authLoading } = useAuth();
  const [content, setContent] = useState<CMSContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [sections, setSections] = useState<BodySection[]>([]);

  useEffect(() => {
    if (!authLoading && !isSystemOwner) {
      router.replace("/dashboard");
    }
  }, [authLoading, isSystemOwner, router]);

  const fetchContent = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cms");
      if (!res.ok) throw new Error("Failed to load content");
      const data = await res.json();
      setContent(data.content);
      setTitle(data.content.title || "");
      setSubtitle(data.content.subtitle || "");
      setSections(data.content.bodySections || []);
    } catch (err) {
      setError("Unable to load content. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSystemOwner) {
      fetchContent();
    }
  }, [isSystemOwner]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/cms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          subtitle,
          bodySections: sections,
        }),
      });

      if (!res.ok) throw new Error("Failed to save content");

      toast.success("Content saved successfully");
      fetchContent();
    } catch (err) {
      toast.error("Failed to save content");
    } finally {
      setSaving(false);
    }
  };

  const addSection = () => {
    setSections([...sections, { type: "text", content: "" }]);
  };

  const updateSection = (index: number, content: string) => {
    const updated = [...sections];
    updated[index] = { ...updated[index], content };
    setSections(updated);
  };

  const removeSection = (index: number) => {
    setSections(sections.filter((_, i) => i !== index));
  };

  if (authLoading || !isSystemOwner) {
    return null;
  }

  return (
    <div data-design-id="cms-about-page" className="p-8">
      <div
        data-design-id="cms-about-header"
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
              data-design-id="cms-about-title"
              className="text-2xl font-bold text-slate-900"
            >
              About Page
            </h1>
            <p
              data-design-id="cms-about-subtitle"
              className="text-slate-600"
            >
              Edit the public About page content
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Link href="/about" target="_blank">
            <Button variant="outline">
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </Button>
          </Link>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700"
            data-design-id="cms-about-save"
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
            <Card data-design-id="cms-about-header-card">
              <CardHeader>
                <CardTitle>Page Header</CardTitle>
                <CardDescription>Title and subtitle displayed at the top</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="About Map My Development Data"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="subtitle">Subtitle</Label>
                  <Input
                    id="subtitle"
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    placeholder="Promoting Transparency in Development"
                  />
                </div>
              </CardContent>
            </Card>

            <Card data-design-id="cms-about-sections-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Body Sections</CardTitle>
                    <CardDescription>Content paragraphs displayed on the page</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={addSection}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Section
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {sections.length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-4">
                    No sections yet. Click &quot;Add Section&quot; to create content.
                  </p>
                )}
                {sections.map((section, index) => (
                  <div key={index} className="relative">
                    <Textarea
                      value={section.content}
                      onChange={(e) => updateSection(index, e.target.value)}
                      placeholder={`Section ${index + 1} content...`}
                      rows={4}
                      className="pr-10"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSection(index)}
                      className="absolute top-2 right-2 text-red-500 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card data-design-id="cms-about-preview-card">
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>Live preview of your content</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-50 rounded-lg p-6">
                <h2 className="text-2xl font-bold text-slate-900 mb-2">
                  {title || "Title"}
                </h2>
                {subtitle && (
                  <p className="text-lg text-emerald-600 mb-6">{subtitle}</p>
                )}
                <div className="space-y-4">
                  {sections.map((section, index) => (
                    <p key={index} className="text-slate-700 leading-relaxed">
                      {section.content || `Section ${index + 1} content...`}
                    </p>
                  ))}
                  {sections.length === 0 && (
                    <p className="text-slate-400 italic">No content sections yet</p>
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