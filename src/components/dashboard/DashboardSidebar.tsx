"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  Building2,
  Upload,
  BarChart3,
  FileText,
  Users,
  User,
  LogOut,
  Globe,
} from "lucide-react";
import { BRANDING, DASHBOARD_NAV } from "@/lib/branding";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  FolderOpen,
  Building2,
  Upload,
  BarChart3,
  FileText,
  Users,
};

export function DashboardSidebar() {
  const pathname = usePathname();
  const { user, isSystemOwner, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    window.location.href = "/";
  };

  const filteredNav = DASHBOARD_NAV.filter((item) => {
    if (item.systemOwnerOnly && !isSystemOwner) {
      return false;
    }
    return true;
  });

  return (
    <aside
      data-design-id="dashboard-sidebar"
      className="fixed left-0 top-0 bottom-0 w-64 bg-slate-900 text-white flex flex-col z-40"
    >
      <div
        data-design-id="dashboard-sidebar-header"
        className="p-6 border-b border-slate-800"
      >
        <Link href="/dashboard" data-design-id="dashboard-logo-link">
          <div
            data-design-id="dashboard-logo-icon"
            className="flex items-center space-x-3"
          >
            <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center">
              <Globe className="w-6 h-6 text-white" />
            </div>
            <div>
              <div
                data-design-id="dashboard-logo-text"
                className="font-semibold text-sm leading-tight"
              >
                {BRANDING.productName}
              </div>
              <div
                data-design-id="dashboard-logo-subtitle"
                className="text-xs text-slate-400"
              >
                Dashboard
              </div>
            </div>
          </div>
        </Link>
      </div>

      <nav
        data-design-id="dashboard-nav"
        className="flex-1 overflow-y-auto py-4 px-3"
      >
        <ul data-design-id="dashboard-nav-list" className="space-y-1">
          {filteredNav.map((item) => {
            const Icon = iconMap[item.icon] || LayoutDashboard;
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <li key={item.href} data-design-id={`dashboard-nav-item-${item.label.toLowerCase().replace(/\s+/g, "-")}`}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors duration-200",
                    isActive
                      ? "bg-emerald-600 text-white"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  )}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className="font-medium text-sm">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div
        data-design-id="dashboard-sidebar-footer"
        className="p-4 border-t border-slate-800"
      >
        <Link
          href="/dashboard/account"
          data-design-id="dashboard-account-link"
          className={cn(
            "flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors duration-200 mb-2",
            pathname === "/dashboard/account"
              ? "bg-emerald-600 text-white"
              : "text-slate-300 hover:bg-slate-800 hover:text-white"
          )}
        >
          <User className="w-5 h-5" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">
              {user?.displayName || "Account"}
            </div>
            <div className="text-xs text-slate-400 truncate">{user?.email}</div>
          </div>
        </Link>

        <button
          onClick={handleLogout}
          data-design-id="dashboard-logout-button"
          className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-slate-300 hover:bg-red-600/20 hover:text-red-400 transition-colors duration-200"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium text-sm">Sign Out</span>
        </button>
      </div>
    </aside>
  );
}