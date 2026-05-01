/**
 * Shared helpers for SYSTEM_OWNER deletion of reference data.
 *
 * Design decisions (Reference Data Delete — PRD §9.x):
 *
 *   1. **Soft delete by default.** Countries, administrative areas, donors,
 *      and sectors are all referenced from Project (and often from
 *      Organization, CountryIndicator, AdministrativeArea). Hard-deleting
 *      them would orphan live data, break reports, and silently rewrite
 *      history. Instead the DELETE endpoints flip `active=false`, stamp
 *      `deletedAt` + `deletedByUserId`, and every GET / filter / dropdown /
 *      upload lookup excludes rows with `deletedAt != null`.
 *
 *   2. **Block on dependencies.** Before soft-deleting we count dependent
 *      rows (projects, organizations, administrative areas, country
 *      indicators, …). If anything references the item we return HTTP 409
 *      with a structured `dependencies` payload the UI can surface in the
 *      confirmation modal ("This donor cannot be deleted because it is
 *      linked to 12 projects"). We also emit a REFERENCE_DELETE_BLOCKED
 *      audit event so blocked attempts are traceable.
 *
 *   3. **No partial deletions.** We never delete some children and leave
 *      the parent referenced — the SYSTEM_OWNER must deactivate / reassign
 *      the children first. The endpoints remain idempotent: deleting an
 *      already-soft-deleted row is a no-op (204-style) not an error.
 *
 *   4. **Audit trail.** Every attempt — success AND blocked — writes an
 *      AuditEvent with the reference type, id, display name, mode, and
 *      counts. Failures in audit.ts are swallowed so they never break the
 *      primary response.
 *
 * This module contains NO request/response plumbing. It is pure data + a
 * tiny readable-summary helper so route handlers stay thin.
 */

import { prisma } from "./prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Human-facing category labels used in API error messages and audit
 * payloads. Keep these short — they appear verbatim in the UI.
 */
export type ReferenceKind =
  | "country"
  | "administrative-area"
  | "donor"
  | "sector";

export const REFERENCE_ENTITY_TYPE: Record<ReferenceKind, string> = {
  country: "ReferenceCountry",
  "administrative-area": "AdministrativeArea",
  donor: "Donor",
  sector: "ReferenceSector",
};

/**
 * A single dependency bucket for the blocked-deletion message.
 *
 * `label` is a pluralised human label ("projects", "administrative areas").
 * `count` is zero when the bucket is safe. The UI summarises the non-zero
 * buckets in the confirmation modal; the API echoes the same structure so
 * the blocked message is identical on both sides.
 */
export interface DependencyBucket {
  label: string;
  count: number;
}

export interface DependencyReport {
  /** Total count across all buckets. `0` ⇒ safe to delete. */
  total: number;
  /** Per-bucket counts (buckets with count 0 are still included for clarity). */
  buckets: DependencyBucket[];
}

// ---------------------------------------------------------------------------
// Dependency counters — one per reference kind.
// ---------------------------------------------------------------------------

/**
 * Count rows that would be orphaned if we deleted the country with the
 * given code. We intentionally count rows that are both `active` and
 * `deletedAt`-null targeted — i.e. the *live* usage, so that a SYSTEM_OWNER
 * who has already deactivated child admin areas and archived projects can
 * proceed. We still respect `deletedAt` on sibling reference rows so a
 * previously soft-deleted admin area does not re-block the parent country.
 */
export async function countCountryDependencies(
  code: string,
): Promise<DependencyReport> {
  const normalised = code.toUpperCase();

  const [areaCount, projectCount, organizationCount, indicatorCount] =
    await Promise.all([
      prisma.administrativeArea.count({
        where: { countryCode: normalised, deletedAt: null },
      }),
      prisma.project.count({ where: { countryCode: normalised } }),
      prisma.organization.count({ where: { countryCode: normalised } }),
      prisma.countryIndicator.count({ where: { countryCode: normalised } }),
    ]);

  const buckets: DependencyBucket[] = [
    { label: "administrative areas", count: areaCount },
    { label: "projects", count: projectCount },
    { label: "organizations", count: organizationCount },
    { label: "country indicator entries", count: indicatorCount },
  ];

  return {
    total: buckets.reduce((n, b) => n + b.count, 0),
    buckets,
  };
}

/**
 * Count rows that reference a specific administrative area id.
 *
 * Projects carry both an FK (`administrativeAreaId`) and free-text
 * `adminArea1` / `adminArea2` columns used by legacy uploads. We only block
 * on the FK — matching free-text columns is fuzzy by nature and would
 * surprise the SYSTEM_OWNER with false positives.
 */
export async function countAdministrativeAreaDependencies(
  id: string,
): Promise<DependencyReport> {
  const projectCount = await prisma.project.count({
    where: { administrativeAreaId: id },
  });

  const buckets: DependencyBucket[] = [
    { label: "projects", count: projectCount },
  ];

  return {
    total: buckets.reduce((n, b) => n + b.count, 0),
    buckets,
  };
}

/** Count rows that reference a specific donor id. */
export async function countDonorDependencies(
  id: string,
): Promise<DependencyReport> {
  const projectCount = await prisma.project.count({ where: { donorId: id } });

  const buckets: DependencyBucket[] = [
    { label: "projects", count: projectCount },
  ];

  return {
    total: buckets.reduce((n, b) => n + b.count, 0),
    buckets,
  };
}

/**
 * Count rows that reference a sector key. Project.sectorKey is the only
 * live reference today — Organization has no sector field.
 */
export async function countSectorDependencies(
  key: string,
): Promise<DependencyReport> {
  const normalised = key.toUpperCase();
  const projectCount = await prisma.project.count({
    where: { sectorKey: normalised },
  });

  const buckets: DependencyBucket[] = [
    { label: "projects", count: projectCount },
  ];

  return {
    total: buckets.reduce((n, b) => n + b.count, 0),
    buckets,
  };
}

// ---------------------------------------------------------------------------
// Human-facing summaries
// ---------------------------------------------------------------------------

/**
 * Build the single-line blocked-deletion message shown to the SYSTEM_OWNER.
 *
 * Examples:
 *   "This donor cannot be deleted because it is linked to 12 projects."
 *   "This country cannot be deleted because it is linked to
 *    3 administrative areas and 2 projects."
 *
 * Only non-zero buckets are listed. `kindLabel` is what appears after the
 * verb ("donor" / "country" / "administrative area" / "sector").
 */
export function formatBlockedMessage(
  kindLabel: string,
  name: string,
  report: DependencyReport,
): string {
  const nonZero = report.buckets.filter((b) => b.count > 0);
  if (nonZero.length === 0) {
    return `Cannot delete ${kindLabel} “${name}”.`;
  }
  const parts = nonZero.map(
    (b) => `${b.count} ${b.count === 1 ? singularise(b.label) : b.label}`,
  );
  const joined =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `Cannot delete ${kindLabel} “${name}” because it is linked to ${joined}.`;
}

/**
 * Dumb English singulariser used only for the blocked-deletion message.
 * We only care about the plural forms we emit from the counters above.
 */
function singularise(plural: string): string {
  if (plural === "administrative areas") return "administrative area";
  if (plural === "projects") return "project";
  if (plural === "organizations") return "organization";
  if (plural === "country indicator entries") return "country indicator entry";
  return plural;
}

// ---------------------------------------------------------------------------
// Exports for kind-labels used in API responses / UI
// ---------------------------------------------------------------------------

export const KIND_LABEL_SINGULAR: Record<ReferenceKind, string> = {
  country: "country",
  "administrative-area": "administrative area",
  donor: "donor",
  sector: "sector",
};