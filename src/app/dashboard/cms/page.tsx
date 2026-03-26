"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Globe, Layers, FileText, ArrowRight } from "lucide-react";

export default function CMSPage() {
  const router = useRouter();
  const { isSystemOwner, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isSystemOwner) {
      router.replace("/dashboard");
    }
  }, [isLoading, isSystemOwner, router]);

  if (isLoading || !isSystemOwner) {
    return null;
  }

  return (
    <div data-design-id="cms-page" className="p-8">
      <div
        data-design-id="cms-header"
        className="mb-6"
      >
        <h1
          data-design-id="cms-title"
          className="text-2xl font-bold text-slate-900"
        >
          Content Management
        </h1>
        <p
          data-design-id="cms-subtitle"
          className="text-slate-600"
        >
          Manage reference data and public content
        </p>
      </div>

      <div
        data-design-id="cms-grid"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        <Card data-design-id="cms-countries-card" className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <Globe className="w-6 h-6 text-blue-600" />
            </div>
            <CardTitle>Countries</CardTitle>
            <CardDescription>
              Manage the list of countries and territories used in project forms and filters.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/cms/countries">
              <Button className="w-full">
                Manage Countries
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card data-design-id="cms-sectors-card" className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <div className="w-12 h-12 bg-sky-100 rounded-lg flex items-center justify-center mb-4">
              <Layers className="w-6 h-6 text-sky-600" />
            </div>
            <CardTitle>Sectors</CardTitle>
            <CardDescription>
              Manage development sectors including icons, colors, and display order.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/cms/sectors">
              <Button className="w-full">
                Manage Sectors
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card data-design-id="cms-about-card" className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <FileText className="w-6 h-6 text-purple-600" />
            </div>
            <CardTitle>About Page</CardTitle>
            <CardDescription>
              Edit the content displayed on the public About page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/cms/about">
              <Button className="w-full">
                Edit About Page
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}