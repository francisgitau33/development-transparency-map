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
  CMS_HOME_CTA_HREF_MAX_LENGTH,
  CMS_HOME_CTA_LABEL_MAX_LENGTH,
  CMS_HOME_DESCRIPTION_MAX_LENGTH,
  CMS_HOME_SUBTITLE_MAX_LENGTH,
  CMS_HOME_TITLE_MAX_LENGTH,
  CMS_PUBLIC_LINKS_EMAIL_MAX_LENGTH,
  CMS_PUBLIC_LINKS_URL_MAX_LENGTH,
  DONOR_FUNDING_CODE_MAX_LENGTH,
  TEAM_MEMBER_BIO_MAX_LENGTH,
  TEAM_MEMBER_NAME_MAX_LENGTH,
  TEAM_MEMBER_ROLE_MAX_LENGTH,
  TEAM_MEMBER_PHOTO_MAX_BYTES,
  TEAM_MEMBER_URL_MAX_LENGTH,
  parseOptionalPopulation,
  parseOptionalPopulationYear,
  validateAdministrativeArea,
  validateCmsHomeContent,
  validateCmsPublicLinks,
  validateOrganization,
  validateProject,
  validateTeamMember,
  validateTeamMemberPhoto,
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

describe("validateTeamMemberPhoto", () => {
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const PNG = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02,
  ]);
  const b64 = (buf: Buffer) => buf.toString("base64");

  it("accepts a valid JPEG payload", () => {
    const r = validateTeamMemberPhoto(b64(JPEG), "image/jpeg");
    expect(r.valid).toBe(true);
    expect(r.mimeType).toBe("image/jpeg");
    expect(r.data?.length).toBe(JPEG.length);
  });

  it("accepts a valid PNG payload", () => {
    const r = validateTeamMemberPhoto(b64(PNG), "image/png");
    expect(r.valid).toBe(true);
    expect(r.mimeType).toBe("image/png");
  });

  it("accepts a data-URL prefixed base64 payload", () => {
    const r = validateTeamMemberPhoto(
      `data:image/png;base64,${b64(PNG)}`,
      "image/png",
    );
    expect(r.valid).toBe(true);
  });

  it("rejects missing base64 data", () => {
    expect(validateTeamMemberPhoto("", "image/jpeg").valid).toBe(false);
    expect(validateTeamMemberPhoto(undefined, "image/jpeg").valid).toBe(false);
    expect(validateTeamMemberPhoto(null, "image/jpeg").valid).toBe(false);
  });

  it("rejects unsupported MIME types", () => {
    const r = validateTeamMemberPhoto(b64(PNG), "image/svg+xml");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/JPEG or PNG/i);
  });

  it("rejects executable / script MIME types", () => {
    expect(
      validateTeamMemberPhoto(b64(PNG), "text/html").valid,
    ).toBe(false);
    expect(
      validateTeamMemberPhoto(b64(PNG), "application/javascript").valid,
    ).toBe(false);
  });

  it("rejects mismatched MIME vs magic bytes", () => {
    // JPEG bytes with PNG MIME
    expect(validateTeamMemberPhoto(b64(JPEG), "image/png").valid).toBe(false);
    // PNG bytes with JPEG MIME
    expect(validateTeamMemberPhoto(b64(PNG), "image/jpeg").valid).toBe(false);
  });

  it("rejects non-base64 gibberish", () => {
    const r = validateTeamMemberPhoto("!!!not base64!!!", "image/jpeg");
    expect(r.valid).toBe(false);
  });

  it("rejects payloads exceeding the max size", () => {
    const huge = Buffer.alloc(TEAM_MEMBER_PHOTO_MAX_BYTES + 1, 0xff);
    huge[0] = 0xff;
    huge[1] = 0xd8;
    huge[2] = 0xff;
    const r = validateTeamMemberPhoto(b64(huge), "image/jpeg");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/too large/i);
  });

  it("rejects an empty payload after decoding", () => {
    const r = validateTeamMemberPhoto(b64(Buffer.alloc(0)), "image/jpeg");
    expect(r.valid).toBe(false);
  });
});
// ---------------------------------------------------------------------------
// CMS Home Page + Public Links
// ---------------------------------------------------------------------------

describe("validateCmsHomeContent", () => {
  const base = {
    heroTitle: "Mapping Development. Enabling Transparency.",
    heroSubtitle: "See who is implementing what, where.",
    heroDescription: "A public geospatial platform.",
    primaryCtaLabel: "Explore the Map",
    primaryCtaHref: "/map",
    secondaryCtaLabel: "",
    secondaryCtaHref: "",
  };

  it("accepts a minimal valid payload (title + subtitle only)", () => {
    const r = validateCmsHomeContent({
      heroTitle: "Title",
      heroSubtitle: "Subtitle",
    });
    expect(r.valid).toBe(true);
    expect(r.normalizedData).toMatchObject({
      heroTitle: "Title",
      heroSubtitle: "Subtitle",
      heroDescription: null,
      primaryCtaLabel: null,
      primaryCtaHref: null,
      secondaryCtaLabel: null,
      secondaryCtaHref: null,
    });
  });

  it("accepts site-relative primary CTA hrefs", () => {
    const r = validateCmsHomeContent(base);
    expect(r.valid).toBe(true);
    expect(r.normalizedData).toMatchObject({ primaryCtaHref: "/map" });
  });

  it("accepts absolute https:// primary CTA hrefs", () => {
    const r = validateCmsHomeContent({
      ...base,
      primaryCtaHref: "https://example.org/path",
    });
    expect(r.valid).toBe(true);
  });

  it("rejects javascript: and mailto: hrefs", () => {
    for (const href of ["javascript:alert(1)", "mailto:foo@bar.com", "data:text/html,x"]) {
      const r = validateCmsHomeContent({ ...base, primaryCtaHref: href });
      expect(r.valid).toBe(false);
    }
  });

  it("rejects missing title / subtitle", () => {
    const r1 = validateCmsHomeContent({ heroTitle: "", heroSubtitle: "S" });
    expect(r1.valid).toBe(false);
    expect(r1.errors.join(" ")).toMatch(/title/i);
    const r2 = validateCmsHomeContent({ heroTitle: "T", heroSubtitle: "" });
    expect(r2.valid).toBe(false);
    expect(r2.errors.join(" ")).toMatch(/subtitle/i);
  });

  it("rejects a label without a link (primary)", () => {
    const r = validateCmsHomeContent({
      ...base,
      primaryCtaLabel: "Go",
      primaryCtaHref: "",
    });
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/primary cta link is required/i);
  });

  it("rejects a link without a label (secondary)", () => {
    const r = validateCmsHomeContent({
      ...base,
      secondaryCtaLabel: "",
      secondaryCtaHref: "/about",
    });
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/secondary cta label is required/i);
  });

  it("enforces character caps", () => {
    const r = validateCmsHomeContent({
      heroTitle: "x".repeat(CMS_HOME_TITLE_MAX_LENGTH + 1),
      heroSubtitle: "x".repeat(CMS_HOME_SUBTITLE_MAX_LENGTH + 1),
      heroDescription: "x".repeat(CMS_HOME_DESCRIPTION_MAX_LENGTH + 1),
      primaryCtaLabel: "x".repeat(CMS_HOME_CTA_LABEL_MAX_LENGTH + 1),
      primaryCtaHref: `/${"x".repeat(CMS_HOME_CTA_HREF_MAX_LENGTH)}`,
    });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(4);
  });

  it("trims whitespace around all fields", () => {
    const r = validateCmsHomeContent({
      heroTitle: "  Title  ",
      heroSubtitle: "  Sub  ",
      heroDescription: "  Desc  ",
    });
    expect(r.valid).toBe(true);
    expect(r.normalizedData).toMatchObject({
      heroTitle: "Title",
      heroSubtitle: "Sub",
      heroDescription: "Desc",
    });
  });
});

describe("validateCmsPublicLinks", () => {
  it("accepts an entirely empty payload (all optional)", () => {
    const r = validateCmsPublicLinks({});
    expect(r.valid).toBe(true);
    expect(r.normalizedData).toEqual({
      linkedinUrl: null,
      mediumUrl: null,
      contactEmail: null,
    });
  });

  it("accepts valid https URLs and emails", () => {
    const r = validateCmsPublicLinks({
      linkedinUrl: "https://www.linkedin.com/company/foo",
      mediumUrl: "https://medium.com/@foo",
      contactEmail: "Hello@Example.ORG",
    });
    expect(r.valid).toBe(true);
    expect(r.normalizedData).toEqual({
      linkedinUrl: "https://www.linkedin.com/company/foo",
      mediumUrl: "https://medium.com/@foo",
      contactEmail: "hello@example.org",
    });
  });

  it("rejects non-https URLs", () => {
    const r = validateCmsPublicLinks({
      linkedinUrl: "http://linkedin.com/x",
      mediumUrl: "ftp://medium.com/x",
    });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects garbage URLs", () => {
    const r = validateCmsPublicLinks({ linkedinUrl: "not a url" });
    expect(r.valid).toBe(false);
  });

  it("rejects invalid email addresses", () => {
    for (const bad of ["not-an-email", "foo@", "@example.org", "a@b", "a b@c.d"]) {
      const r = validateCmsPublicLinks({ contactEmail: bad });
      expect(r.valid).toBe(false);
      expect(r.errors.join(" ")).toMatch(/contact email/i);
    }
  });

  it("enforces URL and email length caps", () => {
    const tooLongUrl = `https://example.org/${"x".repeat(CMS_PUBLIC_LINKS_URL_MAX_LENGTH)}`;
    const tooLongEmail = `${"x".repeat(CMS_PUBLIC_LINKS_EMAIL_MAX_LENGTH)}@example.org`;
    const r = validateCmsPublicLinks({
      linkedinUrl: tooLongUrl,
      contactEmail: tooLongEmail,
    });
    expect(r.valid).toBe(false);
  });

  it("treats blank-string inputs the same as missing", () => {
    const r = validateCmsPublicLinks({
      linkedinUrl: "   ",
      mediumUrl: "",
      contactEmail: "  ",
    });
    expect(r.valid).toBe(true);
    expect(r.normalizedData).toEqual({
      linkedinUrl: null,
      mediumUrl: null,
      contactEmail: null,
    });
  });
});
