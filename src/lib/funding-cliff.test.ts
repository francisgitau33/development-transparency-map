/**
 * Unit tests for funding-cliff pure helpers (see Prompt 6 · Part C).
 */

import { describe, expect, it } from "vitest";
import {
  addMonths,
  buildCliffRow,
  classifyRisk,
  hasUsableBudget,
  hasUsableDates,
  isActive,
  parseWindowMonths,
  type ProjectForCliff,
  SUPPORTED_WINDOWS,
} from "./funding-cliff";

const TODAY = new Date(Date.UTC(2025, 5, 15)); // 2025-06-15

function project(overrides: Partial<ProjectForCliff>): ProjectForCliff {
  return {
    status: "ACTIVE",
    budgetUsd: 100_000,
    startDate: new Date(Date.UTC(2024, 0, 1)),
    endDate: new Date(Date.UTC(2026, 0, 1)),
    ...overrides,
  };
}

describe("parseWindowMonths", () => {
  it("accepts 6 / 12 / 18 / 24", () => {
    for (const n of SUPPORTED_WINDOWS) {
      expect(parseWindowMonths(String(n))).toBe(n);
    }
  });

  it("returns default (12) for null, NaN, or unsupported values", () => {
    expect(parseWindowMonths(null)).toBe(12);
    expect(parseWindowMonths("not-a-number")).toBe(12);
    expect(parseWindowMonths("9")).toBe(12);
    expect(parseWindowMonths("36")).toBe(12);
  });
});

describe("addMonths", () => {
  it("adds positive months using UTC", () => {
    const d = addMonths(new Date(Date.UTC(2025, 0, 1)), 6);
    expect(d.toISOString()).toBe("2025-07-01T00:00:00.000Z");
  });

  it("handles month overflow across a year boundary", () => {
    const d = addMonths(new Date(Date.UTC(2025, 10, 1)), 3);
    expect(d.toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });

  it("does not mutate its input", () => {
    const src = new Date(Date.UTC(2025, 0, 1));
    addMonths(src, 3);
    expect(src.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });
});

describe("classifyRisk", () => {
  it("returns Insufficient data for null / NaN / Infinity", () => {
    expect(classifyRisk(null)).toBe("Insufficient data");
    expect(classifyRisk(Number.NaN)).toBe("Insufficient data");
    expect(classifyRisk(Number.POSITIVE_INFINITY)).toBe("Insufficient data");
  });

  it("classifies boundary values inclusively on the low side", () => {
    expect(classifyRisk(0)).toBe("Low");
    expect(classifyRisk(25)).toBe("Low");
    expect(classifyRisk(25.0001)).toBe("Moderate");
    expect(classifyRisk(50)).toBe("Moderate");
    expect(classifyRisk(50.0001)).toBe("High");
    expect(classifyRisk(75)).toBe("High");
    expect(classifyRisk(75.0001)).toBe("Severe");
    expect(classifyRisk(100)).toBe("Severe");
  });
});

describe("isActive", () => {
  it("excludes COMPLETED projects regardless of dates", () => {
    const p = project({ status: "COMPLETED" });
    expect(isActive(p, TODAY)).toBe(false);
  });

  it("includes ACTIVE projects even when dates are missing", () => {
    expect(
      isActive(
        project({ status: "ACTIVE", startDate: null, endDate: null }),
        TODAY,
      ),
    ).toBe(true);
  });

  it("falls back to date window when status is ambiguous", () => {
    expect(
      isActive(
        project({
          status: "PLANNED",
          startDate: new Date(Date.UTC(2025, 0, 1)),
          endDate: new Date(Date.UTC(2025, 11, 31)),
        }),
        TODAY,
      ),
    ).toBe(true);

    expect(
      isActive(
        project({
          status: "PLANNED",
          startDate: new Date(Date.UTC(2026, 0, 1)),
          endDate: new Date(Date.UTC(2026, 11, 31)),
        }),
        TODAY,
      ),
    ).toBe(false);
  });
});

describe("hasUsableBudget", () => {
  it("requires a finite, positive budget", () => {
    expect(hasUsableBudget(project({ budgetUsd: 100 }))).toBe(true);
    expect(hasUsableBudget(project({ budgetUsd: 0 }))).toBe(false);
    expect(hasUsableBudget(project({ budgetUsd: -1 }))).toBe(false);
    expect(hasUsableBudget(project({ budgetUsd: null }))).toBe(false);
    expect(
      hasUsableBudget(project({ budgetUsd: Number.POSITIVE_INFINITY })),
    ).toBe(false);
  });
});

describe("hasUsableDates", () => {
  it("requires non-null start and end, with end ≥ start", () => {
    expect(hasUsableDates(project({}))).toBe(true);
    expect(
      hasUsableDates(project({ startDate: null, endDate: new Date() })),
    ).toBe(false);
    expect(
      hasUsableDates(project({ startDate: new Date(), endDate: null })),
    ).toBe(false);
    expect(
      hasUsableDates(
        project({
          startDate: new Date(Date.UTC(2026, 0, 1)),
          endDate: new Date(Date.UTC(2025, 0, 1)),
        }),
      ),
    ).toBe(false);
  });
});

describe("buildCliffRow", () => {
  it("computes active-budget → 0 produces null percent and Insufficient data", () => {
    const row = buildCliffRow({
      key: "k",
      name: "Area A",
      activeBudget: 0,
      expiringBudget: 0,
      plannedReplacementBudget: 0,
      activeProjectCount: 0,
      expiringProjectCount: 0,
    });
    expect(row.netExposure).toBe(0);
    expect(row.cliffRiskPercent).toBeNull();
    expect(row.riskLevel).toBe("Insufficient data");
  });

  it("active-budget computation: expiring - planned-replacement, clamped at 0", () => {
    const row = buildCliffRow({
      key: "k",
      name: "Area A",
      activeBudget: 1_000_000,
      expiringBudget: 800_000,
      plannedReplacementBudget: 300_000,
      activeProjectCount: 4,
      expiringProjectCount: 2,
    });
    expect(row.netExposure).toBe(500_000);
    expect(row.cliffRiskPercent).toBe(50);
    expect(row.riskLevel).toBe("Moderate");
  });

  it("clamps net exposure to 0 when planned replacement exceeds expiring", () => {
    const row = buildCliffRow({
      key: "k",
      name: "Area A",
      activeBudget: 1_000_000,
      expiringBudget: 200_000,
      plannedReplacementBudget: 1_000_000,
      activeProjectCount: 4,
      expiringProjectCount: 2,
    });
    expect(row.netExposure).toBe(0);
    expect(row.cliffRiskPercent).toBe(0);
    expect(row.riskLevel).toBe("Low");
  });

  it("classifies severe cliffs correctly", () => {
    const row = buildCliffRow({
      key: "k",
      name: "Area A",
      activeBudget: 1_000_000,
      expiringBudget: 900_000,
      plannedReplacementBudget: 0,
      activeProjectCount: 4,
      expiringProjectCount: 4,
    });
    expect(row.netExposure).toBe(900_000);
    expect(row.cliffRiskPercent).toBe(90);
    expect(row.riskLevel).toBe("Severe");
  });

  it("preserves the subLabel / project counts verbatim", () => {
    const row = buildCliffRow({
      key: "k",
      name: "Area A",
      subLabel: "District",
      activeBudget: 100,
      expiringBudget: 50,
      plannedReplacementBudget: 0,
      activeProjectCount: 7,
      expiringProjectCount: 3,
    });
    expect(row.subLabel).toBe("District");
    expect(row.activeProjectCount).toBe(7);
    expect(row.expiringProjectCount).toBe(3);
  });
});