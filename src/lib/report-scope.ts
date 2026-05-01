/**
 * Shared Prisma `where` builder for Reports & Development Intelligence.
 *
 * Product rule (confirmed, 2026-05-01):
 *
 *   • SYSTEM_OWNER  → platform-wide reportable data by default. May narrow
 *                     via `?organizationId=<id>`.
 *
 *   • PARTNER_ADMIN → platform-wide reportable data by default, with one
 *                     safety rule:
 *                       – own-organisation projects at ANY visibility, AND
 *                       – other organisations' projects ONLY when
 *                         `visibility = "PUBLISHED"`.
 *                     This matches the existing visibility rule already
 *                     enforced for /api/projects (see
 *                     src/app/api/projects/route.ts §"Visibility rules") so
 *                     behaviour is consistent between the Projects list and
 *                     the Reports aggregates. May narrow via
 *                     `?organizationId=<id>` — when the requested id is not
 *                     their own org, only that org's PUBLISHED projects are
 *                     visible.
 *
 *   • Unauthenticated / missing role → defensive fallback: PUBLISHED only.
 *     Report routes return 401 before reaching this helper, but the
 *     fallback is kept so any future caller stays safe-by-default.
 *
 * Why we do NOT forcibly scope Partner Admins to their own organisation
 * anymore:
 *
 *   Reports are a READ surface. The older lock conflated write scope
 *   (create/edit/delete/upload → own-org only, correct) with read scope
 *   (intelligence → historically own-org only, wrong). This helper is
 *   only used from report/analytics GET handlers and never from write
 *   paths. Write scope is unchanged.
 *
 * The helper returns a `Prisma.ProjectWhereInput` fragment that the
 * caller ANDs with their filter-param `where`. Never call this from a
 * write path.
 */

import type { Prisma } from "@prisma/client";

export type ReportUserRoleRow = {
  role: "SYSTEM_OWNER" | "PARTNER_ADMIN" | string;
  organizationId: string | null;
} | null;

export interface ReportUser {
  role?: ReportUserRoleRow;
}

/**
 * Build the role-scoped Prisma where fragment for reports/analytics.
 *
 * @param user               The authenticated user (include: role) or null
 *                           for anonymous.
 * @param requestedOrgId     The value of `?organizationId=` from the
 *                           request, or null when not provided.
 * @returns                  A Prisma.ProjectWhereInput to be ANDed with the
 *                           filter-param where.
 */
export function buildReportOrgVisibilityScope(
  user: ReportUser | null,
  requestedOrgId: string | null,
): Prisma.ProjectWhereInput {
  const trimmed =
    typeof requestedOrgId === "string" && requestedOrgId.trim().length > 0
      ? requestedOrgId.trim()
      : null;

  // SYSTEM_OWNER — no visibility gate, honour explicit org filter.
  if (user?.role?.role === "SYSTEM_OWNER") {
    return trimmed ? { organizationId: trimmed } : {};
  }

  // PARTNER_ADMIN — platform-wide read, own-org any visibility OR
  // other-orgs PUBLISHED only.
  if (user?.role?.role === "PARTNER_ADMIN" && user.role.organizationId) {
    const ownOrg = user.role.organizationId;
    const partnerBase: Prisma.ProjectWhereInput = {
      OR: [
        { organizationId: ownOrg },
        { visibility: "PUBLISHED" },
      ],
    };
    if (!trimmed) return partnerBase;

    // Narrow to requested org, but KEEP the visibility guard. If the
    // request targets a peer org, only that peer's PUBLISHED projects
    // surface. If the request targets the partner's own org, all
    // visibilities are allowed (the OR still matches via the first
    // branch).
    return {
      AND: [{ organizationId: trimmed }, partnerBase],
    };
  }

  // Defensive fallback — unauthenticated or role missing. Report routes
  // 401 before reaching here; this ensures any future non-auth caller
  // never receives non-published data.
  return { visibility: "PUBLISHED" };
}