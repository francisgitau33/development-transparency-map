/**
 * Unit tests for Country Development Context helpers (Prompt 8 · Part I).
 *
 * Covers:
 *   - Controlled indicator vocabulary
 *   - validateCountryIndicator() rules
 *   - computeCountryPopulationSummary()
 *   - buildCountryIndicatorHistory()
 *   - evaluateIndicatorRecency()
 *   - buildCountryContextCompleteness()
 */

import { describe, expect, it } from "vitest";
import {
  ALLOWED_INDICATOR_KEYS,
  buildCountryContextCompleteness,
  buildCountryIndicatorHistory,
  computeCountryPopulationSummary,
  COUNTRY_POPULATION_CALC_NOTE,
  evaluateIndicatorRecency,
  INDICATOR_METADATA,
  isAllowedIndicatorKey,
  MAX_YEARS_PER_INDICATOR,
  validateCountryIndicator,
} from "./country-context";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

describe("ALLOWED_INDICATOR_KEYS", () => {
  it("contains exactly the six Prompt 8 keys and no sixth optional indicator", () => {
    // Prompt 8 explicitly reserves the Business Environment / Business
    // Ready score for a future phase — it MUST NOT appear in this list.
    expect(ALLOWED_INDICATOR_KEYS).toEqual([
      "GDP_PER_CAPITA_CURRENT_USD",
      "HDI_SCORE",
      "HDI_RANK",
      "POVERTY_RATE",
      "ODA_RECEIVED_PER_CAPITA",
      "ODA_AS_PERCENT_GNI",
    ]);
  });

  it("isAllowedIndicatorKey is case-sensitive", () => {
    expect(isAllowedIndicatorKey("HDI_SCORE")).toBe(true);
    expect(isAllowedIndicatorKey("hdi_score")).toBe(false);
    expect(isAllowedIndicatorKey("BUSINESS_READY")).toBe(false);
    expect(isAllowedIndicatorKey("")).toBe(false);
    expect(isAllowedIndicatorKey(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateCountryIndicator
// ---------------------------------------------------------------------------

describe("validateCountryIndicator", () => {
  const now = new Date(Date.UTC(2026, 0, 1)); // 2026-01-01

  it("rejects invalid indicator keys", () => {
    const r = validateCountryIndicator(
      { indicatorKey: "BUSINESS_READY", year: 2023, value: 50 },
      now,
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("indicatorKey"))).toBe(true);
  });

  it("rejects pre-1900 and far-future years", () => {
    const a = validateCountryIndicator(
      { indicatorKey: "POVERTY_RATE", year: 1800, value: 10 },
      now,
    );
    expect(a.valid).toBe(false);
    expect(a.errors.join(" ")).toMatch(/year must be between 1900/);

    const b = validateCountryIndicator(
      { indicatorKey: "POVERTY_RATE", year: 2030, value: 10 },
      now,
    );
    expect(b.valid).toBe(false);
  });

  it("accepts current year + 1", () => {
    const r = validateCountryIndicator(
      { indicatorKey: "POVERTY_RATE", year: 2027, value: 10 },
      now,
    );
    expect(r.valid).toBe(true);
  });

  it("rejects negative GDP per capita", () => {
    const r = validateCountryIndicator(
      { indicatorKey: "GDP_PER_CAPITA_CURRENT_USD", year: 2024, value: -100 },
      now,
    );
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/GDP/);
  });

  it("rejects HDI score outside 0..1", () => {
    const low = validateCountryIndicator(
      { indicatorKey: "HDI_SCORE", year: 2024, value: -0.1 },
      now,
    );
    const high = validateCountryIndicator(
      { indicatorKey: "HDI_SCORE", year: 2024, value: 1.1 },
      now,
    );
    expect(low.valid).toBe(false);
    expect(high.valid).toBe(false);
  });

  it("accepts HDI score 0.55 with notes", () => {
    const r = validateCountryIndicator(
      {
        indicatorKey: "HDI_SCORE",
        year: 2023,
        value: 0.55,
        source: "UNDP",
        sourceUrl: "https://hdr.undp.org/",
        notes: "medium HDI",
      },
      now,
    );
    expect(r.valid).toBe(true);
    expect(r.data?.value).toBe(0.55);
    expect(r.data?.source).toBe("UNDP");
    expect(r.data?.sourceUrl).toBe("https://hdr.undp.org/");
  });

  it("requires HDI_RANK to carry a rank, not a value", () => {
    const onlyValue = validateCountryIndicator(
      { indicatorKey: "HDI_RANK", year: 2024, value: 120 },
      now,
    );
    expect(onlyValue.valid).toBe(false);
    expect(onlyValue.errors.join(" ")).toMatch(/requires a rank/);

    const withRank = validateCountryIndicator(
      { indicatorKey: "HDI_RANK", year: 2024, rank: 120 },
      now,
    );
    expect(withRank.valid).toBe(true);
    expect(withRank.data?.rank).toBe(120);
    expect(withRank.data?.value).toBeNull();
  });

  it("rejects zero or negative HDI rank", () => {
    const zero = validateCountryIndicator(
      { indicatorKey: "HDI_RANK", year: 2024, rank: 0 },
      now,
    );
    const neg = validateCountryIndicator(
      { indicatorKey: "HDI_RANK", year: 2024, rank: -5 },
      now,
    );
    expect(zero.valid).toBe(false);
    expect(neg.valid).toBe(false);
  });

  it("rejects poverty rate outside 0..100", () => {
    const over = validateCountryIndicator(
      { indicatorKey: "POVERTY_RATE", year: 2024, value: 120 },
      now,
    );
    const neg = validateCountryIndicator(
      { indicatorKey: "POVERTY_RATE", year: 2024, value: -5 },
      now,
    );
    expect(over.valid).toBe(false);
    expect(neg.valid).toBe(false);
  });

  it("rejects negative ODA per capita", () => {
    const r = validateCountryIndicator(
      { indicatorKey: "ODA_RECEIVED_PER_CAPITA", year: 2024, value: -1 },
      now,
    );
    expect(r.valid).toBe(false);
  });

  it("allows ODA / GNI above 100% (fragile states) but rejects 501%", () => {
    const ok = validateCountryIndicator(
      { indicatorKey: "ODA_AS_PERCENT_GNI", year: 2024, value: 120 },
      now,
    );
    expect(ok.valid).toBe(true);
    const tooHigh = validateCountryIndicator(
      { indicatorKey: "ODA_AS_PERCENT_GNI", year: 2024, value: 501 },
      now,
    );
    expect(tooHigh.valid).toBe(false);
  });

  it("requires a value for value-only indicators (e.g. GDP per capita)", () => {
    const empty = validateCountryIndicator(
      { indicatorKey: "GDP_PER_CAPITA_CURRENT_USD", year: 2024 },
      now,
    );
    expect(empty.valid).toBe(false);
    expect(empty.errors.join(" ")).toMatch(/requires a value/);
  });

  it("normalises empty strings to null and fills defaultUnit when unit omitted", () => {
    const r = validateCountryIndicator(
      {
        indicatorKey: "GDP_PER_CAPITA_CURRENT_USD",
        year: "2024",
        value: "1500",
        unit: "",
        source: "  ",
        sourceUrl: "",
        notes: "",
      },
      now,
    );
    expect(r.valid).toBe(true);
    expect(r.data?.year).toBe(2024);
    expect(r.data?.value).toBe(1500);
    expect(r.data?.unit).toBe("USD"); // default unit for GDP
    expect(r.data?.source).toBeNull();
    expect(r.data?.sourceUrl).toBeNull();
    expect(r.data?.notes).toBeNull();
  });

  it("rejects a sourceUrl without http(s) prefix", () => {
    const r = validateCountryIndicator(
      {
        indicatorKey: "GDP_PER_CAPITA_CURRENT_USD",
        year: 2024,
        value: 500,
        sourceUrl: "data.worldbank.org",
      },
      now,
    );
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/http/);
  });
});

// ---------------------------------------------------------------------------
// computeCountryPopulationSummary
// ---------------------------------------------------------------------------

describe("computeCountryPopulationSummary", () => {
  it("returns all-nulls when there are no active areas", () => {
    const s = computeCountryPopulationSummary([]);
    expect(s.calculatedPopulation).toBeNull();
    expect(s.activeAdministrativeAreas).toBe(0);
    expect(s.administrativeAreasWithPopulation).toBe(0);
    expect(s.administrativeAreasMissingPopulation).toBe(0);
    expect(s.populationCompletenessPercent).toBeNull();
    expect(s.understatedWarning).toBe(false);
    expect(s.note).toBe(COUNTRY_POPULATION_CALC_NOTE);
  });

  it("ignores inactive areas entirely", () => {
    const s = computeCountryPopulationSummary([
      { active: false, estimatedPopulation: 10_000, populationYear: 2020 },
      { active: true, estimatedPopulation: 500_000, populationYear: 2019 },
    ]);
    expect(s.calculatedPopulation).toBe(500_000);
    expect(s.activeAdministrativeAreas).toBe(1);
    expect(s.administrativeAreasWithPopulation).toBe(1);
  });

  it("ignores non-positive populations without coercing to zero", () => {
    const s = computeCountryPopulationSummary([
      { active: true, estimatedPopulation: 0, populationYear: 2019 },
      { active: true, estimatedPopulation: null, populationYear: null },
      { active: true, estimatedPopulation: 300_000, populationYear: 2020 },
    ]);
    expect(s.calculatedPopulation).toBe(300_000);
    expect(s.administrativeAreasWithPopulation).toBe(1);
    expect(s.administrativeAreasMissingPopulation).toBe(2);
  });

  it("calculates completeness percentage", () => {
    const s = computeCountryPopulationSummary([
      { active: true, estimatedPopulation: 100, populationYear: 2020 },
      { active: true, estimatedPopulation: 200, populationYear: 2021 },
      { active: true, estimatedPopulation: null, populationYear: null },
      { active: true, estimatedPopulation: null, populationYear: null },
    ]);
    expect(s.populationCompletenessPercent).toBe(50);
    expect(s.understatedWarning).toBe(true);
  });

  it("reports correct year range", () => {
    const s = computeCountryPopulationSummary([
      { active: true, estimatedPopulation: 100, populationYear: 2019 },
      { active: true, estimatedPopulation: 200, populationYear: 2022 },
      { active: true, estimatedPopulation: 300, populationYear: 2020 },
    ]);
    expect(s.populationYearMin).toBe(2019);
    expect(s.populationYearMax).toBe(2022);
  });

  it("does not flag understatement when all areas are covered", () => {
    const s = computeCountryPopulationSummary([
      { active: true, estimatedPopulation: 100, populationYear: 2020 },
      { active: true, estimatedPopulation: 200, populationYear: 2020 },
    ]);
    expect(s.understatedWarning).toBe(false);
    expect(s.populationCompletenessPercent).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Indicator history + recency
// ---------------------------------------------------------------------------

describe("buildCountryIndicatorHistory", () => {
  it("groups rows by key, sorts descending, caps at five years", () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      indicatorKey: "GDP_PER_CAPITA_CURRENT_USD",
      year: 2016 + i,
      value: 1000 + i * 10,
      rank: null,
      unit: "USD",
      source: null,
      sourceUrl: null,
      notes: null,
    }));
    const history = buildCountryIndicatorHistory(rows);
    expect(history.GDP_PER_CAPITA_CURRENT_USD.history).toHaveLength(
      MAX_YEARS_PER_INDICATOR,
    );
    expect(history.GDP_PER_CAPITA_CURRENT_USD.history[0].year).toBe(2023);
    expect(history.GDP_PER_CAPITA_CURRENT_USD.latest?.year).toBe(2023);
    // Other indicators remain empty.
    expect(history.HDI_SCORE.history).toHaveLength(0);
    expect(history.HDI_SCORE.latest).toBeNull();
  });

  it("silently skips unknown indicator keys", () => {
    const history = buildCountryIndicatorHistory([
      {
        indicatorKey: "BUSINESS_READY", // not yet implemented
        year: 2023,
        value: 50,
        rank: null,
        unit: null,
        source: null,
        sourceUrl: null,
        notes: null,
      },
    ]);
    // Nothing should have been recorded.
    for (const key of ALLOWED_INDICATOR_KEYS) {
      expect(history[key].history).toHaveLength(0);
    }
  });
});

describe("evaluateIndicatorRecency", () => {
  it("flags missing indicators and outdated ones (>5 years)", () => {
    const history = buildCountryIndicatorHistory([
      {
        indicatorKey: "GDP_PER_CAPITA_CURRENT_USD",
        year: 2018,
        value: 1500,
        rank: null,
        unit: "USD",
        source: null,
        sourceUrl: null,
        notes: null,
      },
      {
        indicatorKey: "HDI_SCORE",
        year: 2024,
        value: 0.5,
        rank: null,
        unit: null,
        source: null,
        sourceUrl: null,
        notes: null,
      },
    ]);
    const recency = evaluateIndicatorRecency(history, 2026);
    const byKey = new Map(recency.map((r) => [r.indicatorKey, r] as const));
    expect(byKey.get("GDP_PER_CAPITA_CURRENT_USD")?.outdated).toBe(true);
    expect(byKey.get("GDP_PER_CAPITA_CURRENT_USD")?.missing).toBe(false);
    expect(byKey.get("HDI_SCORE")?.outdated).toBe(false);
    expect(byKey.get("POVERTY_RATE")?.missing).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildCountryContextCompleteness
// ---------------------------------------------------------------------------

describe("buildCountryContextCompleteness", () => {
  it("reports all indicators missing + passes population completeness through", () => {
    const history = buildCountryIndicatorHistory([]);
    const popSummary = computeCountryPopulationSummary([
      { active: true, estimatedPopulation: 100, populationYear: 2020 },
      { active: true, estimatedPopulation: null, populationYear: null },
    ]);
    const c = buildCountryContextCompleteness(history, popSummary, 2026);
    expect(c.gdpPerCapitaPresent).toBe(false);
    expect(c.hdiPresent).toBe(false);
    expect(c.povertyRatePresent).toBe(false);
    expect(c.odaPresent).toBe(false);
    expect(c.missingIndicatorLabels).toContain(
      INDICATOR_METADATA.GDP_PER_CAPITA_CURRENT_USD.label,
    );
    expect(c.populationCompletenessPercent).toBe(50);
    expect(c.warning).not.toBeNull();
  });

  it("treats HDI as present when either score OR rank has a row", () => {
    const history = buildCountryIndicatorHistory([
      {
        indicatorKey: "HDI_RANK",
        year: 2023,
        value: null,
        rank: 130,
        unit: null,
        source: "UNDP",
        sourceUrl: null,
        notes: null,
      },
    ]);
    const pop = computeCountryPopulationSummary([]);
    const c = buildCountryContextCompleteness(history, pop, 2024);
    expect(c.hdiPresent).toBe(true);
  });

  it("treats ODA as present when either of the two ODA keys has a row", () => {
    const history = buildCountryIndicatorHistory([
      {
        indicatorKey: "ODA_AS_PERCENT_GNI",
        year: 2022,
        value: 12,
        rank: null,
        unit: "%",
        source: "OECD",
        sourceUrl: null,
        notes: null,
      },
    ]);
    const pop = computeCountryPopulationSummary([]);
    const c = buildCountryContextCompleteness(history, pop, 2024);
    expect(c.odaPresent).toBe(true);
  });

  it("no warning when all four indicators are present and recent", () => {
    const history = buildCountryIndicatorHistory([
      {
        indicatorKey: "GDP_PER_CAPITA_CURRENT_USD",
        year: 2024,
        value: 2000,
        rank: null,
        unit: "USD",
        source: "World Bank",
        sourceUrl: null,
        notes: null,
      },
      {
        indicatorKey: "HDI_SCORE",
        year: 2024,
        value: 0.6,
        rank: null,
        unit: null,
        source: "UNDP",
        sourceUrl: null,
        notes: null,
      },
      {
        indicatorKey: "POVERTY_RATE",
        year: 2023,
        value: 20,
        rank: null,
        unit: "%",
        source: "World Bank",
        sourceUrl: null,
        notes: null,
      },
      {
        indicatorKey: "ODA_RECEIVED_PER_CAPITA",
        year: 2024,
        value: 30,
        rank: null,
        unit: "USD",
        source: "OECD",
        sourceUrl: null,
        notes: null,
      },
    ]);
    const pop = computeCountryPopulationSummary([
      { active: true, estimatedPopulation: 500, populationYear: 2021 },
    ]);
    const c = buildCountryContextCompleteness(history, pop, 2025);
    expect(c.warning).toBeNull();
    expect(c.missingIndicatorLabels).toHaveLength(0);
  });
});