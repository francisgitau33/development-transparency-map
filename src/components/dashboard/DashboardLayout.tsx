"use client";

import { ReactNode } from "react";
import { DashboardSidebar } from "./DashboardSidebar";

interface DashboardLayoutProps {
  children: ReactNode;
  title?: string;
  description?: string;
}

export function DashboardLayout({
  children,
  title,
  description,
}: DashboardLayoutProps) {
  return (
    <div data-design-id="dashboard-layout" className="min-h-screen bg-slate-100">
      <DashboardSidebar />
      <main
        data-design-id="dashboard-main"
        className="ml-64 min-h-screen"
      >
        {(title || description) && (
          <header
            data-design-id="dashboard-page-header"
            className="bg-white border-b border-slate-200 px-8 py-6"
          >
            {title && (
              <h1
                data-design-id="dashboard-page-title"
                className="text-2xl font-bold text-slate-900"
              >
                {title}
              </h1>
            )}
            {description && (
              <p
                data-design-id="dashboard-page-description"
                className="mt-1 text-slate-600"
              >
                {description}
              </p>
            )}
          </header>
        )}
        <div
          data-design-id="dashboard-content"
          className="p-8"
        >
          {children}
        </div>
      </main>
    </div>
  );
}