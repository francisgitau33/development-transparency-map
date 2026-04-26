/**
 * Unit tests for population-metrics pure helpers (see Prompt 7 · Part I).
 *
 * All tests run hermetically — no Prisma, no network, no process.env.
 */

import { describe, expect, it } from "vitest";
import {
  beneficiaryReachPercent,
  buildHighPopulationLowCoverageReasons,
  computePopulationCompleteness,
  computePopulationQuartiles,
  isUsablePopulation,
  projectsPer100k,
  recordedInvestmentPerCapita,
} from "./population-metrics";

// ---------------------------------------------------------------------------
// isUsablePopulation
// ---------------------------------------------------------------------------

describe("isUsablePopulation", () => {
  it("accepts positive integers", () => {
    expect(isUsablePopulation(1)).toBe(true);
    expect(isUsablePopulation(1_200_000)).toBe(true);
  });

  it("rejects null, undefined, 0, negative, NaN", () => {
    expect(isUsablePopulation(null)).toBe(false);
    expect(isUsablePopulation(undefined)).toBe(false);
    expect(isUsablePopulation(0)).toBe(false);
    expect(isUsablePopulation(-500)).toBe(false);
    expect(isUsablePopulation(Number.NaN)).toBe(false);
    expect(isUsablePopulation(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// recordedInvestmentPerCapita
// ---------------------------------------------------------------------------

describe("recordedInvestmentPerCapita", () => {
  it("returns value = budget / population when both valid", () => {
    const r = recordedInvestmentPerCapita(5_000_000, 1_000_000);
    expect(r).toEqual({ kind: "value", value: 5 });
  });

  it("returns missing-population when population is null", () => {
    const r = recordedInvestmentPerCapita(5_000_000, null);
    expect(r.kind).toBe("insufficient");
    if (r.kind === "insufficient") {
      expect(r.reason).toBe("missing-population");
      expect(r.label).toBe("Population data missing");
    }
  });

  it("returns missing-population when population is zero (never divide by zero)", () => {
    const r = recordedInvestmentPerCapita(5_000_000, 0);
    expect(r.kind).toBe("insufficient");
    if (r.kind === "insufficient") {
      expect(r.reason).toBe("missing-population");
    }
  });

  it("returns missing-budget when budget is zero or negative", () => {
    const zero = recordedInvestmentPerCapita(0, 1_000_000);
    expect(zero.kind).toBe("insufficient");
    if (zero.kind === "insufficient") {
      expect(zero.reason).toBe("missing-budget");
      expect(zero.label).toBe("Insufficient budget data");
    }
    const neg = recordedInvestmentPerCapita(-1, 1_000_000);
    expect(neg.kind).toBe("insufficient");
  });

  it("never treats missing population as zero", () => {
    // A very large budget with null population must not produce a finite
    // ratio — missing data always dominates.
    const r = recordedInvestmentPerCapita(999_999_999_999, null);
    expect(r.kind).toBe("insufficient");
  });
});

// ---------------------------------------------------------------------------
// projectsPer100k
// ---------------------------------------------------------------------------

describe("projectsPer100k", () => {
  it("calculates (count / pop) * 100_000", () => {
    const r = projectsPer100k(5, 1_000_000);
    expect(r).toEqual({ kind: "value", value: 0.5 });
  });

  it("supports zero project count as a legitimate 0 value", () => {
    const r = projectsPer100k(0, 1_000_000);
    expect(r).toEqual({ kind: "value", value: 0 });
  });

  it("returns missing-population when population is null or 0", () => {
    expect(projectsPer100k(5, null).kind).toBe("insufficient");
    expect(projectsPer100k(5, 0).kind).toBe("insufficient");
  });

  it("rejects negative project counts", () => {
    const r = projectsPer100k(-1, 1_000_000);
    expect(r.kind).toBe("insufficient");
  });
});

// ---------------------------------------------------------------------------
// beneficiaryReachPercent
// ---------------------------------------------------------------------------

describe("beneficiaryReachPercent", () => {
  it("calculates (beneficiaries / pop) * 100", () => {
    const r = beneficiaryReachPercent(200_000, 1_000_000);
    expect(r).toEqual({ kind: "value", value: 20 });
  });

  it("returns a value > 100 when beneficiaries exceed population (programme totals)", () => {
    const r = beneficiaryReachPercent(1_500_000, 1_000_000);
    expect(r.kind).toBe("value");
    if (r.kind === "value") expect(r.value).toBe(150);
  });

  it("returns missing-population when population is null", () => {
    expect(beneficiaryReachPercent(100, null).kind).toBe("insufficient");
  });

  it("returns missing-beneficiaries when beneficiary total is 0", () => {
    const r = beneficiaryReachPercent(0, 1_000_000);
    expect(r.kind).toBe("insufficient");
    if (r.kind === "insufficient") {
      expect(r.reason).toBe("missing-beneficiaries");
    }
  });
});

// ---------------------------------------------------------------------------
// computePopulationQuartiles
// ---------------------------------------------------------------------------

describe("computePopulationQuartiles", () => {
  it("returns null fields when all arrays are empty", () => {
    const q = computePopulationQuartiles({
      populations: [],
      investmentPerCapitaValues: [],
      projectsPer100kValues: [],
      beneficiaryReachValues: [],
    });
    expect(q.populationTopQuartile).toBeNull();
    expect(q.investmentPerCapitaBottomQuartile).toBeNull();
    expect(q.projectsPer100kBottomQuartile).toBeNull();
    expect(q.beneficiaryReachBottomQuartile).toBeNull();
  });

  it("computes p75 of populations and p25 of the others", () => {
    const q = computePopulationQuartiles({
      populations: [100, 200, 300, 400, 500],
      investmentPerCapitaValues: [1, 2, 3, 4, 5],
      projectsPer100kValues: [10, 20, 30, 40, 50],
      beneficiaryReachValues: [1, 2, 3, 4, 5],
    });
    // 5 values 100..500 asc — p75 interpolation = 400
    expect(q.populationTopQuartile).toBeCloseTo(400, 5);
    expect(q.investmentPerCapitaBottomQuartile).toBeCloseTo(2, 5);
    expect(q.projectsPer100kBottomQuartile).toBeCloseTo(20, 5);
    expect(q.beneficiaryReachBottomQuartile).toBeCloseTo(2, 5);
  });
});

// ---------------------------------------------------------------------------
// buildHighPopulationLowCoverageReasons (Part F.4)
// ---------------------------------------------------------------------------

describe("buildHighPopulationLowCoverageReasons", () => {
  const quartiles = {
    populationTopQuartile: 1_000_000,
    investmentPerCapitaBottomQuartile: 5,
    projectsPer100kBottomQuartile: 1,
    beneficiaryReachBottomQuartile: 5,
  };

  it("flags high-population + zero coverage", () => {
    const reasons = buildHighPopulationLowCoverageReasons({
      estimatedPopulation: 1_500_000,
      activeOrPlannedCount: 0,
      investmentPerCapita: {
        kind: "insufficient",
        reason: "missing-budget",
        label: "Insufficient budget data",
      },
      projectsPer100k: { kind: "value", value: 0 },
      beneficiaryReachPercent: {
        kind: "insufficient",
        reason: "missing-beneficiaries",
        label: "Insufficient beneficiary data",
      },
      quartiles,
    });
    expect(reasons).toContain(
      "High population with no recorded active/planned projects",
    );
  });

  it("flags high-population + low investment per capita", () => {
    const reasons = buildHighPopulationLowCoverageReasons({
      estimatedPopulation: 1_500_000,
      activeOrPlannedCount: 4,
      investmentPerCapita: { kind: "value", value: 3 }, // < 5 (bottom q)
      projectsPer100k: { kind: "value", value: 10 },
      beneficiaryReachPercent: { kind: "value", value: 50 },
      quartiles,
    });
    expect(reasons).toContain(
      "High population with low recorded investment per capita",
    );
  });

  it("flags high-population + low projects/100k (only when coverage > 0)", () => {
    const reasons = buildHighPopulationLowCoverageReasons({
      estimatedPopulation: 1_500_000,
      activeOrPlannedCount: 2,
      investmentPerCapita: { kind: "value", value: 100 },
      projectsPer100k: { kind: "value", value: 0.5 }, // ≤ 1 (bottom q)
      beneficiaryReachPercent: { kind: "value", value: 80 },
      quartiles,
    });
    expect(reasons).toContain(
      "High population with low recorded project density",
    );
  });

  it("flags bottom-quartile beneficiary reach for any area with recorded population", () => {
    const reasons = buildHighPopulationLowCoverageReasons({
      // Note: population is BELOW the top quartile — Rule 4 fires anyway.
      estimatedPopulation: 500_000,
      activeOrPlannedCount: 3,
      investmentPerCapita: { kind: "value", value: 100 },
      projectsPer100k: { kind: "value", value: 10 },
      beneficiaryReachPercent: { kind: "value", value: 2 }, // ≤ 5 (bottom q)
      quartiles,
    });
    expect(reasons).toContain(
      "Low recorded beneficiary reach relative to estimated population",
    );
  });

  it("returns [] for a calm area with no flags", () => {
    const reasons = buildHighPopulationLowCoverageReasons({
      estimatedPopulation: 500_000,
      activeOrPlannedCount: 10,
      investmentPerCapita: { kind: "value", value: 100 },
      projectsPer100k: { kind: "value", value: 10 },
      beneficiaryReachPercent: { kind: "value", value: 50 },
      quartiles,
    });
    expect(reasons).toEqual([]);
  });

  it("never flags an area with missing population (Rules 1–3 require population)", () => {
    const reasons = buildHighPopulationLowCoverageReasons({
      estimatedPopulation: null,
      activeOrPlannedCount: 0,
      investmentPerCapita: {
        kind: "insufficient",
        reason: "missing-population",
        label: "Population data missing",
      },
      projectsPer100k: {
        kind: "insufficient",
        reason: "missing-population",
        label: "Population data missing",
      },
      beneficiaryReachPercent: {
        kind: "insufficient",
        reason: "missing-population",
        label: "Population data missing",
      },
      quartiles,
    });
    expect(reasons).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computePopulationCompleteness (Part E)
// ---------------------------------------------------------------------------

describe("computePopulationCompleteness", () => {
  it("handles an empty universe", () => {
    const c = computePopulationCompleteness([]);
    expect(c.totalActiveAreas).toBe(0);
    expect(c.completenessPercent).toBeNull();
    expect(c.populationYearMixedNote).toBeNull();
  });

  it("counts active areas with usable population and computes %", () => {
    const c = computePopulationCompleteness([
      {
        active: true,
        estimatedPopulation: 100,
        populationYear: 2020,
        populationSource: "Mock",
      },
      {
        active: true,
        estimatedPopulation: null,
        populationYear: null,
        populationSource: null,
      },
      {
        active: true,
        estimatedPopulation: 0, // zero is NOT usable
        populationYear: null,
        populationSource: null,
      },
      {
        // inactive rows are ignored entirely
        active: false,
        estimatedPopulation: 999,
        populationYear: 2022,
        populationSource: "Mock",
      },
    ]);
    expect(c.totalActiveAreas).toBe(3);
    expect(c.areasWithPopulation).toBe(1);
    expect(c.areasMissingPopulation).toBe(2);
    expect(c.completenessPercent).toBeCloseTo((1 / 3) * 100, 5);
    expect(c.areasWithPopulationSource).toBe(1);
  });

  it("surfaces a mixed-years note when the spread is > 10 years", () => {
    const c = computePopulationCompleteness([
      {
        active: true,
        estimatedPopulation: 1,
        populationYear: 2002,
        populationSource: "Mock",
      },
      {
        active: true,
        estimatedPopulation: 1,
        populationYear: 2019,
        populationSource: "Mock",
      },
    ]);
    expect(c.populationYearMin).toBe(2002);
    expect(c.populationYearMax).toBe(2019);
    expect(c.populationYearSpread).toBe(17);
    expect(c.populationYearMixedNote).toContain("drawn from different years");
  });

  it("leaves mixed-years note null when spread ≤ 10", () => {
    const c = computePopulationCompleteness([
      {
        active: true,
        estimatedPopulation: 1,
        populationYear: 2018,
        populationSource: "Mock",
      },
      {
        active: true,
        estimatedPopulation: 1,
        populationYear: 2020,
        populationSource: "Mock",
      },
    ]);
    expect(c.populationYearSpread).toBe(2);
    expect(c.populationYearMixedNote).toBeNull();
  });
});