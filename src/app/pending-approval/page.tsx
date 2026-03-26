"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PublicLayout } from "@/components/public/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { Clock, LogOut, RefreshCw } from "lucide-react";
import { BRANDING } from "@/lib/branding";

export default function PendingApprovalPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, logout, refreshSession } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    } else if (!isLoading && isAuthenticated) {
      router.push("/dashboard");
    }
  }, [isLoading, user, isAuthenticated, router]);

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  const handleRefresh = async () => {
    await refreshSession();
    if (isAuthenticated) {
      router.push("/dashboard");
    }
  };

  if (isLoading) {
    return (
      <PublicLayout>
        <div
          data-design-id="pending-loading"
          className="min-h-[calc(100vh-4rem)] flex items-center justify-center"
        >
          <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div
        data-design-id="pending-page"
        className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4"
      >
        <div
          data-design-id="pending-container"
          className="w-full max-w-md"
        >
          <Card data-design-id="pending-card">
            <CardHeader data-design-id="pending-header" className="text-center">
              <div
                data-design-id="pending-icon"
                className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mx-auto mb-4"
              >
                <Clock className="w-8 h-8 text-amber-600" />
              </div>
              <CardTitle data-design-id="pending-title" className="text-2xl">
                Access Pending
              </CardTitle>
              <CardDescription data-design-id="pending-description" className="text-base">
                Your request to access {BRANDING.productName} is being reviewed by an administrator.
              </CardDescription>
            </CardHeader>
            <CardContent data-design-id="pending-content" className="space-y-4">
              <div
                data-design-id="pending-info"
                className="bg-slate-50 rounded-lg p-4 text-sm text-slate-600"
              >
                <p className="mb-2">
                  <strong>Email:</strong> {user?.email}
                </p>
                <p>
                  Once approved, you will be able to access the dashboard to manage your organization&apos;s development projects.
                </p>
              </div>

              <div
                data-design-id="pending-actions"
                className="flex flex-col space-y-3"
              >
                <Button
                  onClick={handleRefresh}
                  variant="outline"
                  className="w-full"
                  data-design-id="pending-refresh"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Check Status
                </Button>
                <Button
                  onClick={handleLogout}
                  variant="ghost"
                  className="w-full text-slate-600"
                  data-design-id="pending-logout"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            </CardContent>
          </Card>

          <p
            data-design-id="pending-back-link"
            className="text-center mt-6 text-sm text-slate-600"
          >
            <Link href="/" className="hover:text-emerald-600 transition-colors">
              ← Back to Home
            </Link>
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}