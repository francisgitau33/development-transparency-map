"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  Globe,
  Layers,
  FileText,
  ArrowRight,
  Map as MapIcon,
  HandCoins,
  Users,
} from "lucide-react";

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

        <Card data-design-id="cms-admin-areas-card" className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center mb-4">
              <MapIcon className="w-6 h-6 text-emerald-600" />
            </div>
            <CardTitle>Districts / Counties</CardTitle>
            <CardDescription>
              Manage administrative areas (Districts, Counties, Regions, …) used
              for project filtering and reporting.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/cms/administrative-areas">
              <Button className="w-full">
                Manage Districts / Counties
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card data-design-id="cms-donors-card" className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center mb-4">
              <HandCoins className="w-6 h-6 text-amber-600" />
            </div>
            <CardTitle>Donors</CardTitle>
            <CardDescription>
              Manage donor / funder reference data linked to projects for funding
              analysis.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/cms/donors">
              <Button className="w-full">
                Manage Donors
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

        <Card data-design-id="cms-team-card" className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <div className="w-12 h-12 bg-rose-100 rounded-lg flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-rose-600" />
            </div>
            <CardTitle>Our Team</CardTitle>
            <CardDescription>
              Add, edit, publish, and remove team members shown on the
              public Our Team page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/cms/team">
              <Button className="w-full">
                Manage Team
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}