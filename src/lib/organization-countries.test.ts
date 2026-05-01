/**
 * Unit tests for the shared multi-country helpers in
 * `src/lib/organization-countries.ts`.
 *
 * These exercise the pure functions only — the DB-touching helpers
 * (`syncOrganizationCountries`, `filterActiveCountryCodes`) are covered
 * indirectly by the route-level tests in `tests/api/organizations.test.ts`.
 *
 * Focus here is the `isCountryInOrganizationScope` / canonical allowed
 * set behaviour consumed by:
 *   - POST /api/projects
 *   - PUT /api/projects/:id
 *   - POST /api/upload
 * All three must answer "can this org operate in country X?" the same
 * way, so the helper is the single source of truth.
 */

import { describe, expect, it } from "vitest";
import {
  getAllowedCountryCodesForOrganization,
  isCountryInOrganizationScope,
  readOrganizationCountries,
} from "./organization-countries";

describe("readOrganizationCountries", () => {
  it("ALL-scope org returns empty ids", () => {
    expect(
      readOrganizationCountries({
        countryScope: "ALL",
        countryCode: null,
        operatingCountries: [],
      }),
    ).toEqual({ countryScope: "ALL", countryIds: [] });
  });

  it("SELECTED-scope org returns sorted, de-duplicated ids", () => {
    expect(
      readOrganizationCountries({
        countryScope: "SELECTED",
        countryCode: "KE",
        operatingCountries: [
          { countryCode: "TZ" },
          { countryCode: "KE" },
          { countryCode: "TZ" },
        ],
      }),
    ).toEqual({ countryScope: "SELECTED", countryIds: ["KE", "TZ"] });
  });

  it("falls back to legacy scalar when join rows are empty", () => {
    expect(
      readOrganizationCountries({
        countryScope: "SELECTED",
        countryCode: "KE",
        operatingCountries: [],
      }),
    ).toEqual({ countryScope: "SELECTED", countryIds: ["KE"] });
  });

  it("returns empty ids when SELECTED + no join + no scalar", () => {
    expect(
      readOrganizationCountries({
        countryScope: "SELECTED",
        countryCode: null,
        operatingCountries: [],
      }),
    ).toEqual({ countryScope: "SELECTED", countryIds: [] });
  });
});

describe("getAllowedCountryCodesForOrganization", () => {
  it("ALL-scope returns null (meaning any country)", () => {
    const allowed = getAllowedCountryCodesForOrganization({
      countryScope: "ALL",
      countryCode: null,
      operatingCountries: [],
    });
    expect(allowed).toBeNull();
  });

  it("SELECTED with join rows returns their codes as a Set", () => {
    const allowed = getAllowedCountryCodesForOrganization({
      countryScope: "SELECTED",
      countryCode: "KE",
      operatingCountries: [{ countryCode: "KE" }, { countryCode: "TZ" }],
    });
    expect(allowed).toBeInstanceOf(Set);
    expect(Array.from(allowed!).sort()).toEqual(["KE", "TZ"]);
  });

  it("SELECTED with empty join falls back to legacy scalar", () => {
    const allowed = getAllowedCountryCodesForOrganization({
      countryScope: "SELECTED",
      countryCode: "KE",
      operatingCountries: [],
    });
    expect(Array.from(allowed!)).toEqual(["KE"]);
  });

  it("SELECTED with neither returns empty set (not null)", () => {
    const allowed = getAllowedCountryCodesForOrganization({
      countryScope: "SELECTED",
      countryCode: null,
      operatingCountries: [],
    });
    expect(allowed).toBeInstanceOf(Set);
    expect(allowed!.size).toBe(0);
  });
});

describe("isCountryInOrganizationScope", () => {
  it("ALL-scope org always matches", () => {
    const org = {
      countryScope: "ALL" as const,
      countryCode: null,
      operatingCountries: [],
    };
    expect(isCountryInOrganizationScope(org, "US")).toBe(true);
    expect(isCountryInOrganizationScope(org, "ZZ")).toBe(true);
  });

  it("SELECTED-scope org matches only countries in the set", () => {
    const org = {
      countryScope: "SELECTED" as const,
      countryCode: "KE",
      operatingCountries: [{ countryCode: "KE" }, { countryCode: "TZ" }],
    };
    expect(isCountryInOrganizationScope(org, "KE")).toBe(true);
    expect(isCountryInOrganizationScope(org, "TZ")).toBe(true);
    expect(isCountryInOrganizationScope(org, "US")).toBe(false);
  });

  it("SELECTED-scope legacy org with only a scalar countryCode", () => {
    const org = {
      countryScope: "SELECTED" as const,
      countryCode: "KE",
      operatingCountries: [],
    };
    expect(isCountryInOrganizationScope(org, "KE")).toBe(true);
    expect(isCountryInOrganizationScope(org, "TZ")).toBe(false);
  });

  it("SELECTED-scope with no scalar and no join rejects all", () => {
    const org = {
      countryScope: "SELECTED" as const,
      countryCode: null,
      operatingCountries: [],
    };
    expect(isCountryInOrganizationScope(org, "KE")).toBe(false);
  });

  it("comparison is case-insensitive on the caller side", () => {
    const org = {
      countryScope: "SELECTED" as const,
      countryCode: "KE",
      operatingCountries: [{ countryCode: "KE" }],
    };
    expect(isCountryInOrganizationScope(org, "ke")).toBe(true);
    expect(isCountryInOrganizationScope(org, "Ke")).toBe(true);
  });
});