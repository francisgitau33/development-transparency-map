/**
 * BRANDING CONFIG - SINGLE SOURCE OF TRUTH
 * All branding, navigation, and product identity comes from here.
 * Do not create alternate branding sources.
 */

export const BRANDING = {
  productName: "Development Transparency Map",
  tagline: "Mapping Development. Enabling Transparency.",
  subtitle: "See who is implementing what, where.",
  description: "A public geospatial platform for development projects worldwide.",
  
  systemOwnerEmail: "theforestforthetrees23@gmail.com",
} as const;

export const PUBLIC_NAV = {
  left: [
    { label: "About", href: "/about" },
  ],
  right: [
    { label: "Partner Access", href: "/login" },
  ],
} as const;

export const DASHBOARD_NAV = [
  { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
  { label: "Projects", href: "/dashboard/projects", icon: "FolderOpen" },
  { label: "Organizations", href: "/dashboard/organizations", icon: "Building2" },
  { label: "Bulk Upload", href: "/dashboard/upload", icon: "Upload" },
  { label: "Reports", href: "/dashboard/reports", icon: "BarChart3" },
  { label: "CMS", href: "/dashboard/cms", icon: "FileText", systemOwnerOnly: true },
  { label: "Users", href: "/dashboard/users", icon: "Users", systemOwnerOnly: true },
] as const;

export const ROLE_TYPES = {
  SYSTEM_OWNER: "SYSTEM_OWNER",
  PARTNER_ADMIN: "PARTNER_ADMIN",
} as const;

export type RoleType = keyof typeof ROLE_TYPES;