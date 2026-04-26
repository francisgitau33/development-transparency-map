"use client";

import type { ReactNode } from "react";
import { PublicHeader } from "./PublicHeader";

interface PublicLayoutProps {
  children: ReactNode;
  fullHeight?: boolean;
}

export function PublicLayout({ children, fullHeight = false }: PublicLayoutProps) {
  return (
    <div
      data-design-id="public-layout"
      className={`min-h-screen bg-slate-50 ${fullHeight ? "flex flex-col" : ""}`}
    >
      <PublicHeader />
      <main
        data-design-id="public-main"
        className={`pt-16 ${fullHeight ? "flex-1 flex flex-col" : ""}`}
      >
        {children}
      </main>
    </div>
  );
}