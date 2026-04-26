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

export function validateOrganization(data: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  const name = normalizeString(data.name);
  const type = normalizeString(data.type).toUpperCase();
  const countryCode = normalizeCountryCode(data.countryCode);

  if (!name) errors.push("Organization name is required");
  if (!["LNGO", "INGO", "FOUNDATION", "GOVERNMENT", "OTHER"].includes(type)) {
    errors.push("Type must be LNGO, INGO, FOUNDATION, GOVERNMENT, or OTHER");
  }
  if (!countryCode) errors.push("Country is required");

  return {
    valid: errors.length === 0,
    errors,
    normalizedData: errors.length === 0
      ? {
          name,
          type,
          countryCode,
          website: normalizeString(data.website) || null,
          contactEmail: normalizeEmail(data.contactEmail) || null,
          description: normalizeString(data.description) || null,
          active: data.active !== false,
        }
      : undefined,
  };
}