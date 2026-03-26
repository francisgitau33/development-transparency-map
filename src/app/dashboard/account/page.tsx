"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth-context";
import { BRANDING } from "@/lib/branding";
import { User, Shield, Building2, Mail, Calendar, CheckCircle } from "lucide-react";

export default function AccountPage() {
  const { user, isSystemOwner, isPartnerAdmin } = useAuth();

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div data-design-id="account-page" className="p-8">
      <div
        data-design-id="account-header"
        className="mb-6"
      >
        <h1
          data-design-id="account-title"
          className="text-2xl font-bold text-slate-900"
        >
          Account
        </h1>
        <p
          data-design-id="account-subtitle"
          className="text-slate-600"
        >
          Your account information and access details
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-design-id="account-profile-card">
          <CardHeader>
            <CardTitle className="flex items-center">
              <User className="w-5 h-5 mr-2" />
              Profile Information
            </CardTitle>
            <CardDescription>Your personal account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div data-design-id="account-email" className="flex items-start">
              <Mail className="w-5 h-5 text-slate-400 mr-3 mt-0.5" />
              <div>
                <p className="text-sm text-slate-500">Email</p>
                <p className="font-medium">{user?.email}</p>
              </div>
            </div>

            <Separator />

            <div data-design-id="account-name" className="flex items-start">
              <User className="w-5 h-5 text-slate-400 mr-3 mt-0.5" />
              <div>
                <p className="text-sm text-slate-500">Display Name</p>
                <p className="font-medium">{user?.displayName || "Not set"}</p>
              </div>
            </div>

            <Separator />

            <div data-design-id="account-id" className="flex items-start">
              <Shield className="w-5 h-5 text-slate-400 mr-3 mt-0.5" />
              <div>
                <p className="text-sm text-slate-500">User ID</p>
                <p className="font-mono text-sm">{user?.id}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-design-id="account-access-card">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Shield className="w-5 h-5 mr-2" />
              Access & Permissions
            </CardTitle>
            <CardDescription>Your role and organization access</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div data-design-id="account-role" className="flex items-start">
              <CheckCircle className="w-5 h-5 text-sky-500 mr-3 mt-0.5" />
              <div>
                <p className="text-sm text-slate-500">Role</p>
                <Badge
                  variant="outline"
                  className={
                    isSystemOwner
                      ? "bg-purple-50 text-purple-700 mt-1"
                      : "bg-blue-50 text-blue-700 mt-1"
                  }
                >
                  {isSystemOwner ? "System Owner" : isPartnerAdmin ? "Partner Admin" : "Unknown"}
                </Badge>
              </div>
            </div>

            <Separator />

            <div data-design-id="account-organization" className="flex items-start">
              <Building2 className="w-5 h-5 text-slate-400 mr-3 mt-0.5" />
              <div>
                <p className="text-sm text-slate-500">Organization</p>
                <p className="font-medium">
                  {user?.organization?.name || (isSystemOwner ? "All Organizations (System Owner)" : "Not assigned")}
                </p>
              </div>
            </div>

            <Separator />

            <div data-design-id="account-state" className="flex items-start">
              <CheckCircle className="w-5 h-5 text-sky-500 mr-3 mt-0.5" />
              <div>
                <p className="text-sm text-slate-500">Access State</p>
                <Badge variant="outline" className="bg-sky-50 text-sky-700 mt-1">
                  Approved
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {isSystemOwner && (
          <Card data-design-id="account-diagnostics-card" className="lg:col-span-2">
            <CardHeader>
              <CardTitle>System Diagnostics</CardTitle>
              <CardDescription>
                Debug information for system administrators
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-50 rounded-lg p-4 font-mono text-sm">
                <pre className="whitespace-pre-wrap">
{JSON.stringify({
  userId: user?.id,
  email: user?.email,
  role: user?.role,
  organizationId: user?.organizationId,
  authState: user?.authState,
  isSystemOwner,
  isPartnerAdmin,
  systemOwnerEmail: BRANDING.systemOwnerEmail,
}, null, 2)}
                </pre>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}