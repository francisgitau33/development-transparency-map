"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { PageLoadingState } from "@/components/shared/LoadingState";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace("/login");
      } else if (!isAuthenticated) {
        router.replace("/pending-approval");
      }
    }
  }, [isLoading, user, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div data-design-id="dashboard-loading" className="min-h-screen bg-slate-100">
        <PageLoadingState message="Loading dashboard..." />
      </div>
    );
  }

  if (!user || !isAuthenticated) {
    return null;
  }

  return (
    <div data-design-id="dashboard-wrapper" className="min-h-screen bg-slate-100">
      <DashboardSidebar />
      <main data-design-id="dashboard-main-content" className="ml-64">
        {children}
      </main>
    </div>
  );
}