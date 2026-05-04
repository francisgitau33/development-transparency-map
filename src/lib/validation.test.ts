/**
 * Unit tests for validation helpers (see Prompt 7 · Part I.1).
 *
 * Focuses on:
 *   - validateAdministrativeArea accepts missing population fields.
 *   - validateAdministrativeArea rejects zero / negative populations.
 *   - validateAdministrativeArea rejects unreasonable population years.
 *   - parseOptionalPopulation & parseOptionalPopulationYear behave.
 */

import { describe, expect, it } from "vitest";
import {
  DONOR_FUNDING_CODE_MAX_LENGTH,
  TEAM_MEMBER_BIO_MAX_LENGTH,
  TEAM_MEMBER_NAME_MAX_LENGTH,
  TEAM_MEMBER_ROLE_MAX_LENGTH,
  TEAM_MEMBER_URL_MAX_LENGTH,
  parseOptionalPopulation,
  parseOptionalPopulationYear,
  validateAdministrativeArea,
  validateOrganization,
  validateProject,
  validateTeamMember,
} from "./validation";

describe("parseOptionalPopulation", () => {
  it("treats null / undefined / empty string as 'value: null'", () => {
    for (const input of [null, undefined, ""]) {
      const r = parseOptionalPopulation(input);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBeNull();
    }
  });

  it("accepts a positive integer number", () => {
    const r = parseOptionalPopulation(1_200_000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(1_200_000);
  });

  it("accepts a numeric string and parses it", () => {
    const r = parseOptionalPopulation("  500000 ");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(500_000);
  });

  it("rejects zero explicitly (never divide by zero in reports)", () => {
    const r = parseOptionalPopulation(0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/greater than zero/i);
  });

  it("rejects negatives, floats, NaN, and non-numeric strings", () => {
    expect(parseOptionalPopulation(-5).ok).toBe(false);
    expect(parseOptionalPopulation(1.5).ok).toBe(false);
    expect(parseOptionalPopulation("not a number").ok).toBe(false);
    expect(parseOptionalPopulation(Number.NaN).ok).toBe(false);
  });
});

describe("parseOptionalPopulationYear", () => {
  const frozenNow = new Date(Date.UTC(2026, 0, 1));

  it("treats missing / empty as null", () => {
    expect(parseOptionalPopulationYear(null, frozenNow)).toEqual({
      ok: true,
      value: null,
    });
    expect(parseOptionalPopulationYear("", frozenNow)).toEqual({
      ok: true,
      value: null,
    });
  });

  it("accepts years from 1900 to currentYear + 1", () => {
    expect(parseOptionalPopulationYear(1900, frozenNow).ok).toBe(true);
    expect(parseOptionalPopulationYear(2026, frozenNow).ok).toBe(true);
    expect(parseOptionalPopulationYear(2027, frozenNow).ok).toBe(true);
  });

  it("rejects years before 1900 and after currentYear + 1", () => {
    expect(parseOptionalPopulationYear(1899, frozenNow).ok).toBe(false);
    expect(parseOptionalPopulationYear(2028, frozenNow).ok).toBe(false);
    expect(parseOptionalPopulationYear("19988", frozenNow).ok).toBe(false);
  });
});

describe("validateAdministrativeArea (population fields)", () => {
  const base = { name: "Test County", countryCode: "KE", type: "County" };

  it("validates an area WITHOUT population fields (they're optional)", () => {
    const r = validateAdministrativeArea(base);
    expect(r.valid).toBe(true);
    expect(r.normalizedData).toBeDefined();
    expect(r.normalizedData?.estimatedPopulation).toBeNull();
    expect(r.normalizedData?.populationYear).toBeNull();
    expect(r.normalizedData?.populationSource).toBeNull();
    expect(r.normalizedData?.populationSourceUrl).toBeNull();
    expect(r.normalizedData?.populationNotes).toBeNull();
  });

  it("validates and normalizes a complete population record", () => {
    const r = validateAdministrativeArea({
      ...base,
      estimatedPopulation: 1_200_000,
      populationYear: 2019,
      populationSource: "  National Census 2019  ",
      populationSourceUrl: "https://example.org/census",
      populationNotes: "Projection note",
    });
    expect(r.valid).toBe(true);
    expect(r.normalizedData?.estimatedPopulation).toBe(1_200_000);
    expect(r.normalizedData?.populationYear).toBe(2019);
    expect(r.normalizedData?.populationSource).toBe("National Census 2019");
    expect(r.normalizedData?.populationSourceUrl).toBe(
      "https://example.org/census",
    );
    expect(r.normalizedData?.populationNotes).toBe("Projection note");
  });

  it("rejects zero population", () => {
    const r = validateAdministrativeArea({ ...base, estimatedPopulation: 0 });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /greater than zero/i.test(e))).toBe(true);
  });

  it("rejects a negative population", () => {
    const r = validateAdministrativeArea({
      ...base,
      estimatedPopulation: -100,
    });
    expect(r.valid).toBe(false);
  });

  it("rejects a population year outside the permitted range", () => {
    const r = validateAdministrativeArea({
      ...base,
      estimatedPopulation: 1000,
      populationYear: 1800,
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /1900/.test(e))).toBe(true);
  });

  it("rejects a non-http population source URL", () => {
    const r = validateAdministrativeArea({
      ...base,
      estimatedPopulation: 1000,
      populationSourceUrl: "not-a-url",
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /http:/i.test(e))).toBe(true);
  });

  it("allows population with missing year / source (partial data is fine)", () => {
    const r = validateAdministrativeArea({
      ...base,
      estimatedPopulation: 1000,
    });
    expect(r.valid).toBe(true);
    expect(r.normalizedData?.estimatedPopulation).toBe(1000);
    expect(r.normalizedData?.populationYear).toBeNull();
    expect(r.normalizedData?.populationSource).toBeNull();
  });
describe("validateOrganization (multi-country)", () => {
  const base = { name: "World Vision", type: "INGO" };

  it("rejects empty name / invalid type", () => {
    expect(validateOrganization({}).valid).toBe(false);
    expect(
      validateOrganization({ ...base, type: "NOPE", countryIds: ["US"] }).valid,
    ).toBe(false);
  });

  it("accepts the new shape { scope: SELECTED, countryIds: [c1] }", () => {
    const r = validateOrganization({
      ...base,
      countryScope: "SELECTED",
      countryIds: ["us"],
    });
    expect(r.valid).toBe(true);
    expect(r.normalizedData?.countryScope).toBe("SELECTED");
    expect(r.normalizedData?.countryIds).toEqual(["US"]);
    // Legacy column mirrored to first selected country.
    expect(r.normalizedData?.countryCode).toBe("US");
  });

  it("accepts multiple countries and de-duplicates / uppercases", () => {
    const r = validateOrganization({
      ...base,
      countryScope: "SELECTED",
      countryIds: ["ke", "TZ", "ke", "ug"],
    });
    expect(r.valid).toBe(true);
    expect(r.normalizedData?.countryIds).toEqual(["KE", "TZ", "UG"]);
    expect(r.normalizedData?.countryCode).toBe("KE");
  });

  it("accepts { scope: ALL } with empty ids and clears legacy code", () => {
    const r = validateOrganization({
      ...base,
      countryScope: "ALL",
      countryIds: [],
    });
    expect(r.valid).toBe(true);
    expect(r.normalizedData?.countryScope).toBe("ALL");
    expect(r.normalizedData?.countryIds).toEqual([]);
    expect(r.normalizedData?.countryCode).toBeNull();
  });

  it("ignores incoming countryIds when scope is ALL (canonicalises to [])", () => {
    const r = validateOrganization({
      ...base,
      countryScope: "ALL",
      countryIds: ["US", "KE"],
    });
    expect(r.valid).toBe(true);
    expect(r.normalizedData?.countryIds).toEqual([]);
  });

  it("rejects SELECTED scope with zero countries", () => {
    const r = validateOrganization({
      ...base,
      countryScope: "SELECTED",
      countryIds: [],
    });
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/at least one country/i);
  });

  it("back-compat: legacy { countryCode: 'US' } is promoted to the new shape", () => {
    const r = validateOrganization({ ...base, countryCode: "us" });
    expect(r.valid).toBe(true);
    expect(r.normalizedData?.countryScope).toBe("SELECTED");
    expect(r.normalizedData?.countryIds).toEqual(["US"]);
    expect(r.normalizedData?.countryCode).toBe("US");
  });

  it("back-compat: legacy payload with no country at all is rejected", () => {
    const r = validateOrganization({ ...base });
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/at least one country/i);
  });
});
});

// -----------------------------------------------------------------------
// validateProject — donorFundingCode (optional grant / funding / budget
// line reference). Covers the acceptance criteria for the new field:
//   - absent / blank / whitespace-only ⇒ stored as null
//   - present ⇒ trimmed and stored verbatim
//   - over-length ⇒ validation error
// Everything else about validateProject is exercised via the existing
// API-level integration tests.
// -----------------------------------------------------------------------
describe("validateProject (donorFundingCode)", () => {
  const baseProject = {
    title: "Demo",
    description: "desc",
    organizationId: "org_1",
    countryCode: "US",
    sectorKey: "HEALTH",
    status: "ACTIVE",
    startDate: "2024-01-01",
    latitude: 40,
    longitude: -74,
  };

  it("treats a missing donorFundingCode as null", () => {
    const r = validateProject({ ...baseProject });
    expect(r.valid).toBe(true);
    expect(r.normalizedData?.donorFundingCode).toBeNull();
  });

  it("treats a blank / whitespace-only donorFundingCode as null", () => {
    const r = validateProject({
      ...baseProject,
      donorFundingCode: "   \t \n  ",
    });
    expect(r.valid).toBe(true);
    expect(r.normalizedData?.donorFundingCode).toBeNull();
  });

  it("trims surrounding whitespace and stores the verbatim code", () => {
    const r = validateProject({
      ...baseProject,
      donorFundingCode: "  GRANT-2024-US-001  ",
    });
    expect(r.valid).toBe(true);
    expect(r.normalizedData?.donorFundingCode).toBe("GRANT-2024-US-001");
  });

  it("accepts a code at the maximum allowed length", () => {
    const max = "A".repeat(DONOR_FUNDING_CODE_MAX_LENGTH);
    const r = validateProject({
      ...baseProject,
      donorFundingCode: max,
    });
    expect(r.valid).toBe(true);
    expect(r.normalizedData?.donorFundingCode).toBe(max);
  });

  it("rejects a code longer than the configured maximum", () => {
    const tooLong = "B".repeat(DONOR_FUNDING_CODE_MAX_LENGTH + 1);
    const r = validateProject({
      ...baseProject,
      donorFundingCode: tooLong,
    });
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/donor \/ funding code/i);
    // Other required fields were all provided, so the error must be the
    // length error we just added and nothing else.
    expect(r.errors).toHaveLength(1);
  });

  it("does not leak donorFundingCode into the existing required-field errors", () => {
    // Missing required fields should still surface as their own errors,
    // and the donorFundingCode path must not swallow them.
    const r = validateProject({ donorFundingCode: "GRANT-1" });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(1);
    // Sanity: the donor-funding-code length rule did NOT fire here, only
    // the required-field rules should have.
    expect(
      r.errors.find((e) => /donor \/ funding code/i.test(e)),
    ).toBeUndefined();
  });
});

describe("validateTeamMember", () => {
  const base = { name: "Ada Lovelace", role: "Advisor" };

  it("accepts a minimal valid row and normalises optional strings to null", () => {
    const r = validateTeamMember({ ...base });
    expect(r.valid).toBe(true);
    expect(r.normalizedData).toMatchObject({
      name: "Ada Lovelace",
      role: "Advisor",
      bio: null,
      photoUrl: null,
      linkedinUrl: null,
      displayOrder: 0,
      active: true,
    });
  });

  it("requires name and role", () => {
    const r = validateTeamMember({ name: "  ", role: "" });
    expect(r.valid).toBe(false);
    expect(r.errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/name is required/i),
        expect.stringMatching(/role is required/i),
      ]),
    );
  });

  it("caps name, role, and bio at their max lengths", () => {
    const r = validateTeamMember({
      name: "x".repeat(TEAM_MEMBER_NAME_MAX_LENGTH + 1),
      role: "y".repeat(TEAM_MEMBER_ROLE_MAX_LENGTH + 1),
      bio: "z".repeat(TEAM_MEMBER_BIO_MAX_LENGTH + 1),
    });
    expect(r.valid).toBe(false);
    expect(r.errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/name must be /i),
        expect.stringMatching(/role must be /i),
        expect.stringMatching(/bio must be /i),
      ]),
    );
  });

  it("accepts http(s) URLs and rejects anything else", () => {
    const ok = validateTeamMember({
      ...base,
      photoUrl: "https://example.com/ada.jpg",
      linkedinUrl: "http://linkedin.com/in/ada",
    });
    expect(ok.valid).toBe(true);
    expect(ok.normalizedData).toMatchObject({
      photoUrl: "https://example.com/ada.jpg",
      linkedinUrl: "http://linkedin.com/in/ada",
    });

    const badScheme = validateTeamMember({
      ...base,
      photoUrl: "javascript:alert(1)",
    });
    expect(badScheme.valid).toBe(false);
    expect(badScheme.errors.join(" ")).toMatch(/photo url/i);

    const notAUrl = validateTeamMember({
      ...base,
      photoUrl: "not a url",
    });
    expect(notAUrl.valid).toBe(false);
  });

  it("rejects URLs beyond the max length", () => {
    const tooLong = `https://example.com/${"a".repeat(TEAM_MEMBER_URL_MAX_LENGTH)}`;
    const r = validateTeamMember({ ...base, photoUrl: tooLong });
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/photo url/i);
  });

  it("treats displayOrder undefined/empty as 0 and rejects negatives / non-integers", () => {
    expect(validateTeamMember({ ...base }).normalizedData?.displayOrder).toBe(
      0,
    );
    expect(
      validateTeamMember({ ...base, displayOrder: "" }).normalizedData
        ?.displayOrder,
    ).toBe(0);
    expect(
      validateTeamMember({ ...base, displayOrder: 3 }).normalizedData
        ?.displayOrder,
    ).toBe(3);
    expect(validateTeamMember({ ...base, displayOrder: -1 }).valid).toBe(
      false,
    );
    expect(validateTeamMember({ ...base, displayOrder: 1.5 }).valid).toBe(
      false,
    );
    expect(
      validateTeamMember({ ...base, displayOrder: "abc" }).valid,
    ).toBe(false);
  });

  it("treats active explicitly false as false and everything else as true", () => {
    expect(
      validateTeamMember({ ...base, active: false }).normalizedData?.active,
    ).toBe(false);
    expect(
      validateTeamMember({ ...base, active: true }).normalizedData?.active,
    ).toBe(true);
    // Omitted / undefined should default to true for a newly added member.
    expect(validateTeamMember({ ...base }).normalizedData?.active).toBe(true);
  });

  it("trims name, role, bio, and URL values before storing", () => {
    const r = validateTeamMember({
      name: "  Ada  ",
      role: " Advisor ",
      bio: " Built the first compiler. ",
      photoUrl: "   https://example.com/a.jpg  ",
      linkedinUrl: "  https://www.linkedin.com/in/ada ",
    });
    expect(r.valid).toBe(true);
    expect(r.normalizedData).toMatchObject({
      name: "Ada",
      role: "Advisor",
      bio: "Built the first compiler.",
      photoUrl: "https://example.com/a.jpg",
      linkedinUrl: "https://www.linkedin.com/in/ada",
    });
  });
});