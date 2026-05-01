/**
 * CANONICAL VALIDATION LAYER
 * All writes must normalize then validate then save.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  normalizedData?: Record<string, unknown>;
}

export function normalizeString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function normalizeEmail(value: unknown): string {
  return normalizeString(value).toLowerCase();
}

export function normalizeCountryCode(value: unknown): string {
  return normalizeString(value).toUpperCase();
}

export function normalizeSectorKey(value: unknown): string {
  return normalizeString(value).toUpperCase();
}

export function normalizeRole(value: unknown): string {
  return normalizeString(value).toUpperCase();
}

export function normalizeDate(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().split("T")[0];
}

export function normalizeCoordinate(value: unknown, precision = 6): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number.parseFloat(String(value));
  if (Number.isNaN(num)) return null;
  return Math.round(num * 10 ** precision) / 10 ** precision;
}

export function validateProject(data: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  const title = normalizeString(data.title);
  const description = normalizeString(data.description);
  const organizationId = normalizeString(data.organizationId);
  const countryCode = normalizeCountryCode(data.countryCode);
  const sectorKey = normalizeSectorKey(data.sectorKey);
  const latitude = normalizeCoordinate(data.latitude);
  const longitude = normalizeCoordinate(data.longitude);
  const startDate = normalizeDate(data.startDate);
  const status = normalizeString(data.status).toUpperCase();

  if (!title) errors.push("Title is required");
  if (!description) errors.push("Description is required");
  if (!organizationId) errors.push("Organization is required");
  if (!countryCode) errors.push("Country code is required");
  if (!sectorKey) errors.push("Sector is required");
  if (latitude === null) errors.push("Latitude is required");
  if (longitude === null) errors.push("Longitude is required");
  if (!startDate) errors.push("Start date is required");
  if (!["ACTIVE", "PLANNED", "COMPLETED"].includes(status)) {
    errors.push("Status must be ACTIVE, PLANNED, or COMPLETED");
  }

  if (latitude !== null && (latitude < -90 || latitude > 90)) {
    errors.push("Latitude must be between -90 and 90");
  }
  if (longitude !== null && (longitude < -180 || longitude > 180)) {
    errors.push("Longitude must be between -180 and 180");
  }

  return {
    valid: errors.length === 0,
    errors,
    normalizedData: errors.length === 0
      ? {
          title,
          description,
          organizationId,
          countryCode,
          sectorKey,
          latitude,
          longitude,
          startDate,
          status,
          endDate: normalizeDate(data.endDate),
          budgetUsd: data.budgetUsd ? Number.parseFloat(String(data.budgetUsd)) : null,
          targetBeneficiaries: data.targetBeneficiaries ? Number.parseInt(String(data.targetBeneficiaries)) : null,
          adminArea1: normalizeString(data.adminArea1) || null,
          adminArea2: normalizeString(data.adminArea2) || null,
          administrativeAreaId: normalizeString(data.administrativeAreaId) || null,
          donorId: normalizeString(data.donorId) || null,
          locationName: normalizeString(data.locationName) || null,
          dataSource: normalizeString(data.dataSource) || null,
          contactEmail: normalizeEmail(data.contactEmail) || null,
        }
      : undefined,
  };
}

export function validateCountry(data: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  const code = normalizeCountryCode(data.code);
  const name = normalizeString(data.name);
  const type = normalizeString(data.type).toUpperCase();

  if (!code) errors.push("Country code is required");
  if (!name) errors.push("Country name is required");
  if (!["COUNTRY", "TERRITORY"].includes(type)) {
    errors.push("Type must be COUNTRY or TERRITORY");
  }

  return {
    valid: errors.length === 0,
    errors,
    normalizedData: errors.length === 0
      ? {
          code,
          name,
          type,
          active: data.active !== false,
          sortOrder: Number.parseInt(String(data.sortOrder)) || 0,
        }
      : undefined,
  };
}

export function validateSector(data: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  const key = normalizeSectorKey(data.key);
  const name = normalizeString(data.name);
  const icon = normalizeString(data.icon);
  const color = normalizeString(data.color);

  if (!key) errors.push("Sector key is required");
  if (!name) errors.push("Sector name is required");
  if (!icon) errors.push("Icon is required");
  if (!color) errors.push("Color is required");

  return {
    valid: errors.length === 0,
    errors,
    normalizedData: errors.length === 0
      ? {
          key,
          name,
          icon,
          color,
          active: data.active !== false,
          sortOrder: Number.parseInt(String(data.sortOrder)) || 0,
        }
      : undefined,
  };
}

const ADMIN_AREA_TYPES = new Set([
  "DISTRICT",
  "COUNTY",
  "REGION",
  "PROVINCE",
  "STATE",
  "MUNICIPALITY",
  "SUBCOUNTY",
  "DIVISION",
  "WARD",
  "OTHER",
]);

/**
 * Parse a user-supplied population integer. Accepts numbers or numeric
 * strings, trims whitespace, and rejects zero / negative values.
 *
 * Returns:
 *   { ok: true, value: number }   — integer ≥ 1
 *   { ok: true, value: null }     — field was genuinely missing / empty
 *   { ok: false, error: string }  — present but invalid (NaN, 0, negative…)
 *
 * This is a shared building block used by validateAdministrativeArea and
 * the population-metrics helpers. Extracted so the rejection rule for
 * "zero population" is identical everywhere.
 */
export function parseOptionalPopulation(
  raw: unknown,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }
  let n: number;
  if (typeof raw === "number") {
    n = raw;
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") return { ok: true, value: null };
    n = Number(trimmed);
  } else {
    return { ok: false, error: "Estimated population must be a whole number" };
  }
  if (!Number.isFinite(n)) {
    return { ok: false, error: "Estimated population must be a whole number" };
  }
  if (!Number.isInteger(n)) {
    return { ok: false, error: "Estimated population must be a whole number" };
  }
  if (n <= 0) {
    return {
      ok: false,
      error: "Estimated population must be greater than zero",
    };
  }
  return { ok: true, value: n };
}

/**
 * Parse a user-supplied population year. Accepts a number or numeric
 * string; requires 1900 ≤ year ≤ currentYear + 1 so typos like 19988 or
 * pre-1900 values are rejected without blocking legitimate projections
 * one year into the future.
 */
export function parseOptionalPopulationYear(
  raw: unknown,
  now: Date = new Date(),
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }
  let n: number;
  if (typeof raw === "number") {
    n = raw;
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") return { ok: true, value: null };
    n = Number(trimmed);
  } else {
    return { ok: false, error: "Population year must be a valid year" };
  }
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, error: "Population year must be a valid year" };
  }
  const maxYear = now.getUTCFullYear() + 1;
  if (n < 1900 || n > maxYear) {
    return {
      ok: false,
      error: `Population year must be between 1900 and ${maxYear}`,
    };
  }
  return { ok: true, value: n };
}

export function validateAdministrativeArea(
  data: Record<string, unknown>,
): ValidationResult {
  const errors: string[] = [];

  const name = normalizeString(data.name);
  const countryCode = normalizeCountryCode(data.countryCode);
  // `type` is optional and free-form, but we normalize casing for consistency.
  const rawType = normalizeString(data.type);
  const type = rawType ? rawType.toUpperCase() : "";

  if (!name) errors.push("Administrative area name is required");
  if (!countryCode) errors.push("Country is required");
  if (type && !ADMIN_AREA_TYPES.has(type)) {
    // Allow free-form types but record a warning-style error only when
    // an obviously garbage value is supplied. Unknown but reasonable
    // strings pass through so countries with unusual local labels
    // (e.g. "Oblast", "Prefecture") still work.
    if (type.length > 64) {
      errors.push("Administrative area type is too long");
    }
  }

  // --- Optional population fields ------------------------------------------
  // All five fields are OPTIONAL for MVP. A missing estimatedPopulation is
  // allowed (area saves successfully, but population-weighted reports will
  // mark the row as "Population data missing"). If estimatedPopulation IS
  // provided, it must be a positive whole number and — when year/source are
  // supplied — those must also pass their own rules.
  const populationParse = parseOptionalPopulation(data.estimatedPopulation);
  let estimatedPopulation: number | null = null;
  if (!populationParse.ok) {
    errors.push(populationParse.error);
  } else {
    estimatedPopulation = populationParse.value;
  }

  const yearParse = parseOptionalPopulationYear(data.populationYear);
  let populationYear: number | null = null;
  if (!yearParse.ok) {
    errors.push(yearParse.error);
  } else {
    populationYear = yearParse.value;
  }

  const populationSourceRaw = normalizeString(data.populationSource);
  if (populationSourceRaw.length > 512) {
    errors.push("Population source is too long (max 512 characters)");
  }
  const populationSource = populationSourceRaw || null;

  const populationSourceUrlRaw = normalizeString(data.populationSourceUrl);
  if (
    populationSourceUrlRaw &&
    populationSourceUrlRaw.length > 0 &&
    !/^https?:\/\//i.test(populationSourceUrlRaw)
  ) {
    errors.push("Population source URL must start with http:// or https://");
  }
  if (populationSourceUrlRaw.length > 2048) {
    errors.push("Population source URL is too long (max 2048 characters)");
  }
  const populationSourceUrl = populationSourceUrlRaw || null;

  const populationNotesRaw = normalizeString(data.populationNotes);
  if (populationNotesRaw.length > 2000) {
    errors.push("Population notes are too long (max 2000 characters)");
  }
  const populationNotes = populationNotesRaw || null;

  return {
    valid: errors.length === 0,
    errors,
    normalizedData:
      errors.length === 0
        ? {
            name,
            countryCode,
            type: rawType || null,
            active: data.active !== false,
            sortOrder: Number.parseInt(String(data.sortOrder)) || 0,
            estimatedPopulation,
            populationYear,
            populationSource,
            populationSourceUrl,
            populationNotes,
          }
        : undefined,
  };
}

const DONOR_TYPES = new Set([
  "BILATERAL",
  "MULTILATERAL",
  "FOUNDATION",
  "CORPORATE",
  "GOVERNMENT",
  "INDIVIDUAL",
  "INGO",
  "POOLED_FUND",
  "POOLED FUND",
  "OTHER",
]);

export function validateDonor(data: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  const name = normalizeString(data.name);
  const rawType = normalizeString(data.donorType);
  const donorType = rawType ? rawType.toUpperCase() : "";

  if (!name) errors.push("Donor name is required");
  if (rawType && rawType.length > 64) {
    errors.push("Donor type is too long");
  }
  // DONOR_TYPES is suggestive, not enforced, so partners can record unusual
  // funder categories without a schema change.
  void DONOR_TYPES;
  void donorType;

  const website = normalizeString(data.website);
  if (website && !/^https?:\/\//i.test(website)) {
    errors.push("Donor website must start with http:// or https://");
  }

  return {
    valid: errors.length === 0,
    errors,
    normalizedData:
      errors.length === 0
        ? {
            name,
            donorType: rawType || null,
            countryOfOrigin:
              normalizeCountryCode(data.countryOfOrigin) || null,
            website: website || null,
            active: data.active !== false,
            sortOrder: Number.parseInt(String(data.sortOrder)) || 0,
          }
        : undefined,
  };
}

/**
 * Organization validation (multi-country edition).
 *
 * Accepts EITHER the new shape:
 *   { countryScope: "ALL" | "SELECTED", countryIds: string[] }
 * OR the legacy shape:
 *   { countryCode: "XX" }
 * so older clients / tests keep working. Legacy input is normalised up into
 * the new shape before validation so the rest of the stack only has to
 * reason about ONE representation.
 *
 * Valid states (enforced):
 *   - countryScope = "ALL" AND countryIds is empty
 *   - countryScope = "SELECTED" AND countryIds has ≥ 1 unique country code
 */
export function validateOrganization(data: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  const name = normalizeString(data.name);
  const type = normalizeString(data.type).toUpperCase();

  if (!name) errors.push("Organization name is required");
  if (!["LNGO", "INGO", "FOUNDATION", "GOVERNMENT", "OTHER"].includes(type)) {
    errors.push("Type must be LNGO, INGO, FOUNDATION, GOVERNMENT, or OTHER");
  }

  // --- Country scope + country ids --------------------------------------
  const rawScope = normalizeString(data.countryScope).toUpperCase();

  // Legacy inputs: { countryCode: "XX" } → { scope: SELECTED, ids: ["XX"] }.
  // We treat legacy as a hard fallback only when neither scope nor ids
  // were supplied, so clients that already pass the new shape are not
  // silently overridden.
  const legacyCountryCode = normalizeCountryCode(data.countryCode);

  const rawIds = Array.isArray(data.countryIds) ? data.countryIds : undefined;

  const scope: "ALL" | "SELECTED" = rawScope === "ALL"
    ? "ALL"
    : rawScope === "SELECTED"
      ? "SELECTED"
      : "SELECTED";

  let countryIds: string[] = [];
  if (scope === "SELECTED") {
    if (rawIds && rawIds.length > 0) {
      countryIds = Array.from(
        new Set(
          rawIds
            .map((v) => normalizeCountryCode(v))
            .filter((v): v is string => v.length > 0),
        ),
      );
    } else if (legacyCountryCode) {
      // Legacy single-country payload.
      countryIds = [legacyCountryCode];
    }

    if (countryIds.length === 0) {
      errors.push(
        "Select at least one country of operation, or choose \"All Countries\".",
      );
    }
  } else {
    // ALL scope: ignore any ids the client may have sent so the saved state
    // is always canonical ({ scope: ALL, ids: [] }).
    countryIds = [];
  }

  return {
    valid: errors.length === 0,
    errors,
    normalizedData: errors.length === 0
      ? {
          name,
          type,
          countryScope: scope,
          countryIds,
          // Legacy column — kept in sync with the first selected country so
          // code that still reads Organization.countryCode keeps working.
          // ALL-scope rows clear the legacy column (it is now nullable).
          countryCode: scope === "SELECTED" ? countryIds[0] ?? null : null,
          website: normalizeString(data.website) || null,
          contactEmail: normalizeEmail(data.contactEmail) || null,
          description: normalizeString(data.description) || null,
          active: data.active !== false,
        }
      : undefined,
  };
}