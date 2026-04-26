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
  parseOptionalPopulation,
  parseOptionalPopulationYear,
  validateAdministrativeArea,
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
});