"use client";

import Link from "next/link";
import { PUBLIC_NAV } from "@/lib/branding";

/**
 * PUBLIC HEADER COMPONENT
 * 
 * STRICT RULES (from spec):
 * - Left side: About
 * - Right side: Partner Access
 * 
 * DO NOT ADD:
 * - Explore Map (it goes on homepage hero as CTA)
 * - Dashboard
 * - CMS
 * - Sign In / Sign Up
 * - Any other navigation items
 */
export function PublicHeader() {
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
            {PUBLIC_NAV.left.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                data-design-id={`public-nav-${item.label.toLowerCase()}`}
                className="text-slate-700 hover:text-sky-600 font-medium transition-colors duration-200"
              >
                {item.label}
              </Link>
            ))}
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
                className="inline-flex items-center px-4 py-2 bg-sky-500 text-white rounded-lg font-medium hover:bg-sky-600 transition-colors duration-200"
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