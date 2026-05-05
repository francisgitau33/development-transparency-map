"use client";

import { useEffect, useState } from "react";
import { Globe, Mail } from "lucide-react";
import { BRANDING } from "@/lib/branding";
import { LinkedinIcon } from "./icons/LinkedinIcon";
import { MediumIcon } from "./icons/MediumIcon";

/**
 * PublicFooter
 *
 * Shared across the public Home page and About page. Renders:
 *   - Brand mark + product name
 *   - Social media icons (LinkedIn, Medium) — each one is rendered ONLY
 *     if an https:// URL is configured in the CMS `publicLinks` record.
 *     Icons link out with target="_blank" + rel="noopener noreferrer"
 *     and carry accessible aria-labels.
 *   - Contact email — rendered ONLY if configured. Clickable mailto:
 *     link.
 *   - Copyright line.
 *
 * Data is fetched from /api/cms/public-links on mount. If the endpoint
 * fails or returns no data the footer simply omits the corresponding
 * elements — it never blocks the page.
 *
 * Styling is intentionally visually-light (dark slate matching the
 * existing homepage/about footer treatment) so it does not overpower
 * the main page content.
 */

interface PublicLinks {
  linkedinUrl: string | null;
  mediumUrl: string | null;
  contactEmail: string | null;
}

const EMPTY: PublicLinks = {
  linkedinUrl: null,
  mediumUrl: null,
  contactEmail: null,
};

export function PublicFooter({
  variant = "default",
}: {
  /**
   * `default` — dark background, used by Home + About.
   * `light`   — reserved for future pages that need a light footer;
   *             keeps the same data/structure but flips to light tokens.
   */
  variant?: "default" | "light";
}) {
  const [links, setLinks] = useState<PublicLinks>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/cms/public-links", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const next = (data?.links ?? {}) as Partial<PublicLinks>;
        setLinks({
          linkedinUrl: next.linkedinUrl ?? null,
          mediumUrl: next.mediumUrl ?? null,
          contactEmail: next.contactEmail ?? null,
        });
      } catch {
        // Degrade silently — an unreachable links endpoint must never
        // break the public page.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isLight = variant === "light";
  const year = new Date().getFullYear();

  return (
    <footer
      data-design-id="public-footer"
      className={
        isLight
          ? "bg-slate-100 text-slate-700 py-12 border-t border-slate-200"
          : "bg-slate-900 text-white py-12"
      }
    >
      <div
        data-design-id="public-footer-container"
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center"
      >
        <div
          data-design-id="public-footer-logo"
          className={
            isLight
              ? "inline-flex items-center justify-center w-12 h-12 bg-sky-100 rounded-xl mb-4"
              : "inline-flex items-center justify-center w-12 h-12 bg-sky-500/20 rounded-xl mb-4"
          }
        >
          <Globe
            data-design-id="public-footer-globe-icon"
            className={isLight ? "w-6 h-6 text-sky-600" : "w-6 h-6 text-sky-400"}
          />
        </div>
        <p
          data-design-id="public-footer-brand"
          className="text-lg font-semibold mb-2"
        >
          {BRANDING.productName}
        </p>
        <p
          data-design-id="public-footer-tagline"
          className={isLight ? "text-slate-500" : "text-slate-400"}
        >
          {BRANDING.tagline}
        </p>

        {(links.linkedinUrl || links.mediumUrl) && (
          <div
            data-design-id="public-footer-socials"
            className="mt-6 flex items-center justify-center gap-4"
          >
            {links.linkedinUrl && (
              <a
                data-design-id="public-footer-linkedin"
                href={links.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Visit us on LinkedIn"
                className={
                  isLight
                    ? "inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-200 hover:bg-sky-100 text-slate-600 hover:text-sky-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                    : "inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-800 hover:bg-sky-500/30 text-slate-300 hover:text-sky-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                }
              >
                <LinkedinIcon className="w-5 h-5" />
              </a>
            )}
            {links.mediumUrl && (
              <a
                data-design-id="public-footer-medium"
                href={links.mediumUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Read us on Medium"
                className={
                  isLight
                    ? "inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-200 hover:bg-sky-100 text-slate-600 hover:text-sky-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                    : "inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-800 hover:bg-sky-500/30 text-slate-300 hover:text-sky-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                }
              >
                <MediumIcon className="w-5 h-5" />
              </a>
            )}
          </div>
        )}

        {links.contactEmail && (
          <p
            data-design-id="public-footer-contact"
            className={
              isLight
                ? "mt-6 text-sm text-slate-600"
                : "mt-6 text-sm text-slate-300"
            }
          >
            <span className="inline-flex items-center gap-2">
              <Mail className="w-4 h-4" aria-hidden="true" />
              <span>Contact:</span>
              <a
                data-design-id="public-footer-contact-email"
                href={`mailto:${links.contactEmail}`}
                className={
                  isLight
                    ? "text-sky-700 hover:text-sky-900 underline-offset-4 hover:underline"
                    : "text-sky-300 hover:text-sky-200 underline-offset-4 hover:underline"
                }
              >
                {links.contactEmail}
              </a>
            </span>
          </p>
        )}

        <p
          data-design-id="public-footer-copyright"
          className={
            isLight
              ? "mt-8 text-xs text-slate-500"
              : "mt-8 text-xs text-slate-500"
          }
        >
          © {year} {BRANDING.productName}
        </p>
      </div>
    </footer>
  );
}