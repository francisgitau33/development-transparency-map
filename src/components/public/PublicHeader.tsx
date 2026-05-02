"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PUBLIC_NAV } from "@/lib/branding";

/**
 * PUBLIC HEADER COMPONENT
 *
 * STRICT RULES (from spec):
 * - Left side: About  (default, e.g. on homepage)
 * - Right side: Partner Access
 *
 * Route-aware left-side behaviour:
 * - On `/about` and `/map`, the left side is replaced with a single
 *   "← Back to Home" link that routes to `/`. The About page previously
 *   rendered a self-referencing "About" link, and the Map page had no way
 *   back to Home from the top bar. Both now expose an explicit,
 *   keyboard-accessible link.
 * - On the homepage and Partner Access (`/login`), the default About link
 *   is preserved so public visitors can still reach the About page.
 *
 * DO NOT ADD:
 * - Explore Map (it goes on homepage hero as CTA)
 * - Dashboard
 * - CMS
 * - Sign In / Sign Up
 * - Any other navigation items
 */
export function PublicHeader() {
  const pathname = usePathname();
  // Back-to-Home is only useful on pages that are themselves NOT the home
  // page. We intentionally scope this to the About and Explore Map pages
  // per the current UX spec.
  const showBackToHome = pathname === "/about" || pathname === "/map";

  return (
    <header
      data-design-id="public-header"
      className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-200"
    >
      <div
        data-design-id="public-header-container"
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
      >
        <nav
          data-design-id="public-header-nav"
          className="flex items-center justify-between h-16"
        >
          <div
            data-design-id="public-header-left"
            className="flex items-center space-x-8"
          >
            {showBackToHome ? (
              <Link
                href="/"
                data-design-id="public-nav-back-to-home"
                aria-label="Back to Home"
                className="inline-flex items-center gap-1 text-slate-700 hover:text-sky-600 font-medium transition-colors duration-200 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
              >
                <span aria-hidden="true">←</span>
                <span>Back to Home</span>
              </Link>
            ) : (
              PUBLIC_NAV.left.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  data-design-id={`public-nav-${item.label.toLowerCase()}`}
                  className="text-slate-700 hover:text-sky-600 font-medium transition-colors duration-200 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                >
                  {item.label}
                </Link>
              ))
            )}
          </div>

          <div
            data-design-id="public-header-right"
            className="flex items-center"
          >
            {PUBLIC_NAV.right.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                data-design-id={`public-nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                className="inline-flex items-center px-4 py-2 bg-sky-500 text-white rounded-lg font-medium hover:bg-sky-600 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </header>
  );
}