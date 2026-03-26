"use client";

import { useEffect, useState } from "react";
import { PublicLayout } from "@/components/public/PublicLayout";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Globe } from "lucide-react";
import { BRANDING } from "@/lib/branding";

interface CMSContent {
  title: string;
  subtitle: string | null;
  bodySections: Array<{ type: string; content: string }>;
}

export default function AboutPage() {
  const [content, setContent] = useState<CMSContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContent = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cms");
      if (!res.ok) throw new Error("Failed to load content");
      const data = await res.json();
      setContent(data.content);
    } catch (err) {
      setError("Unable to load page content. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContent();
  }, []);

  return (
    <PublicLayout>
      <div
        data-design-id="about-page"
        className="min-h-[calc(100vh-4rem)]"
      >
        <div
          data-design-id="about-hero"
          className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 py-20"
        >
          <div
            data-design-id="about-hero-container"
            className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center"
          >
            <div
              data-design-id="about-hero-icon"
              className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/20 rounded-2xl mb-6"
            >
              <Globe className="w-8 h-8 text-emerald-400" />
            </div>
            {loading ? (
              <div data-design-id="about-hero-loading" className="h-20 animate-pulse bg-slate-700/50 rounded-lg max-w-lg mx-auto" />
            ) : (
              <>
                <h1
                  data-design-id="about-title"
                  className="text-4xl sm:text-5xl font-bold text-white mb-4"
                >
                  {content?.title || "About Us"}
                </h1>
                {content?.subtitle && (
                  <p
                    data-design-id="about-subtitle"
                    className="text-xl text-emerald-300"
                  >
                    {content.subtitle}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        <div
          data-design-id="about-content"
          className="py-16 bg-white"
        >
          <div
            data-design-id="about-content-container"
            className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8"
          >
            {loading && <LoadingState message="Loading content..." />}
            
            {error && <ErrorState message={error} onRetry={fetchContent} />}
            
            {!loading && !error && content && (
              <div
                data-design-id="about-body"
                className="prose prose-lg prose-slate max-w-none"
              >
                {content.bodySections.map((section, index) => (
                  <p
                    key={index}
                    data-design-id={`about-section-${index}`}
                    className="text-slate-700 leading-relaxed mb-6"
                  >
                    {section.content}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>

        <footer
          data-design-id="about-footer"
          className="bg-slate-900 text-white py-12"
        >
          <div
            data-design-id="about-footer-container"
            className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center"
          >
            <p
              data-design-id="about-footer-brand"
              className="text-lg font-semibold mb-2"
            >
              {BRANDING.productName}
            </p>
            <p
              data-design-id="about-footer-tagline"
              className="text-slate-400"
            >
              {BRANDING.tagline}
            </p>
          </div>
        </footer>
      </div>
    </PublicLayout>
  );
}