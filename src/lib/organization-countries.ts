import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Helpers for reading + writing the multi-country state of an Organization.
 *
 * The write path keeps two representations in sync on every save:
 *   1. The authoritative `OrganizationCountry[]` join table rows, plus the
 *      `Organization.countryScope` discriminator.
 *   2. The legacy `Organization.countryCode` scalar column — set to the
 *      first selected country for SELECTED-scope orgs, or NULL for
 *      ALL-scope orgs. This keeps older analytics paths that still read
 *      the scalar working until they are ported.
 *
 * The read helpers always return the canonical multi-country shape.
 */

type TxClient = PrismaClient | Prisma.TransactionClient;

export interface OrganizationCountryState {
  /** "ALL" means global coverage; "SELECTED" means one or more countries. */
  countryScope: "ALL" | "SELECTED";
  /** Empty for ALL-scope orgs. For SELECTED orgs, at least one country. */
  countryIds: string[];
}

/**
 * Derive the canonical multi-country state from a loaded Organization.
 *
 * Accepts either:
 *   - A Prisma Organization with `operatingCountries: { countryCode }[]`
 *     already included, OR
 *   - A bare Organization — in which case we fall back to the legacy
 *     `countryCode` scalar. That fallback exists so ancient code paths that
 *     do `prisma.organization.findUnique({ where })` without any `include`
 *     still produce a sensible shape.
 */
export function readOrganizationCountries(
  org: {
    countryScope?: "ALL" | "SELECTED";
    countryCode?: string | null;
    operatingCountries?: { countryCode: string }[];
  },
): OrganizationCountryState {
  const scope: "ALL" | "SELECTED" = org.countryScope === "ALL" ? "ALL" : "SELECTED";

  if (scope === "ALL") {
    return { countryScope: "ALL", countryIds: [] };
  }

  if (org.operatingCountries && org.operatingCountries.length > 0) {
    const ids = Array.from(
      new Set(org.operatingCountries.map((r) => r.countryCode)),
    ).sort();
    return { countryScope: "SELECTED", countryIds: ids };
  }

  // Legacy fallback — data pre-dates the join table backfill.
  if (org.countryCode) {
    return { countryScope: "SELECTED", countryIds: [org.countryCode] };
  }

  return { countryScope: "SELECTED", countryIds: [] };
}

/**
 * Replace the `OrganizationCountry` rows for a single org so they match
 * `countryIds`. Called inside a transaction so the delete + insert are
 * atomic.
 *
 * Caller is responsible for:
 *   - validating input with {@link validateOrganization}
 *   - checking each countryCode is an ACTIVE, non-deleted ReferenceCountry
 *     (see {@link filterActiveCountryCodes}).
 */
export async function syncOrganizationCountries(
  tx: TxClient,
  organizationId: string,
  scope: "ALL" | "SELECTED",
  countryIds: string[],
): Promise<void> {
  // Wipe every existing join row for this org first. Done unconditionally
  // (ALL-scope orgs end up with zero rows; SELECTED-scope orgs get a fresh
  // replacement set) so we never leak stale selections from a previous
  // save.
  await tx.organizationCountry.deleteMany({ where: { organizationId } });

  if (scope === "ALL" || countryIds.length === 0) return;

  await tx.organizationCountry.createMany({
    data: countryIds.map((countryCode) => ({ organizationId, countryCode })),
    skipDuplicates: true,
  });
}

/**
 * Intersect the given country codes with the set of ACTIVE,
 * non-soft-deleted ReferenceCountry codes. Returns the accepted subset
 * plus the list of codes that were rejected so the API can report a
 * precise validation error.
 */
export async function filterActiveCountryCodes(
  codes: string[],
  client: TxClient = prisma,
): Promise<{ accepted: string[]; rejected: string[] }> {
  if (codes.length === 0) return { accepted: [], rejected: [] };

  const rows = await client.referenceCountry.findMany({
    where: {
      code: { in: codes },
      active: true,
      deletedAt: null,
    },
    select: { code: true },
  });

  const acceptedSet = new Set(rows.map((r) => r.code));
  const accepted: string[] = [];
  const rejected: string[] = [];
  for (const code of codes) {
    if (acceptedSet.has(code)) accepted.push(code);
    else rejected.push(code);
  }

  return { accepted, rejected };
}