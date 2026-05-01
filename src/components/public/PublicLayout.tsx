"use client";

import type { ReactNode } from "react";
import { PublicHeader } from "./PublicHeader";

interface PublicLayoutProps {
  children: ReactNode;
  /**
   * `fullHeight` — the main region consumes remaining viewport height with
   * `min-height: 100vh`. The page CAN still grow taller than the viewport
   * (i.e. body scroll stays enabled). Used by content pages that embed a
   * tall widget like the homepage.
   */
  fullHeight?: boolean;
  /**
   * `fullBleed` — the entire page is locked to exactly one viewport
   * (`h-screen overflow-hidden`) and the main region is a flex column with
   * `min-h-0` so nested `flex-1` children (the map) can shrink correctly
   * and absolute overlays (legend / summary) do not push the container
   * past the fold. Used by the /map page so Leaflet owns the bulk of the
   * viewport with no trailing footer whitespace.
   */
  fullBleed?: boolean;
}

export function PublicLayout({
  children,
  fullHeight = false,
  fullBleed = false,
}: PublicLayoutProps) {
  // fullBleed implies fullHeight semantics for nested flex-1 children.
  const shell = fullBleed
    ? "h-screen overflow-hidden flex flex-col"
    : fullHeight
      ? "min-h-screen flex flex-col"
      : "min-h-screen";
  // `min-h-0` is critical: without it, a `flex-1` child (main) will not
  // shrink below its content's intrinsic height inside a `flex-col`
  // parent, which collapses the Leaflet map into a narrow strip.
  const mainCls = fullBleed
    ? "pt-16 flex-1 min-h-0 flex flex-col"
    : fullHeight
      ? "pt-16 flex-1 flex flex-col"
      : "pt-16";

  return (
    <div data-design-id="public-layout" className={`bg-slate-50 ${shell}`}>
      <PublicHeader />
      <main data-design-id="public-main" className={mainCls}>
        {children}
      </main>
    </div>
  );
}