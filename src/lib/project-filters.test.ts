/**
 * Unit tests for shared project filter builder (see Prompt 6 · Part C).
 *
 * Validates:
 *   - Active During Year window semantics (inclusive overlap).
 *   - Budget Tier ranges (MICRO / SMALL / MEDIUM / LARGE).
 *   - Multi-tier selection produces OR-of-ranges.
 *   - Enum / string filters are upper-cased where appropriate.
 *   - Unknown tier tokens are silently dropped.
 *   - Out-of-range years are ignored (no spurious AND clause).
 */

import { describe, expect, it } from "vitest";
import {
  buildProjectFilterWhere,
  parseProjectFilterParams,
} from "./project-filters";

function whereFrom(qs: string) {
  const params = new URLSearchParams(qs);
  return buildProjectFilterWhere(parseProjectFilterParams(params)).where;
}

describe("parseProjectFilterParams", () => {
  it("returns null for absent params (uses URLSearchParams.get semantics)", () => {
    const parsed = parseProjectFilterParams(new URLSearchParams(""));
    expect(parsed.countryCode).toBeNull();
    expect(parsed.sectorKey).toBeNull();
    expect(parsed.status).toBeNull();
    expect(parsed.organizationId).toBeNull();
    expect(parsed.organizationType).toBeNull();
    expect(parsed.administrativeAreaId).toBeNull();
    expect(parsed.donorId).toBeNull();
    expect(parsed.activeDuringYear).toBeNull();
    expect(parsed.budgetTier).toBeNull();
  });

  it("reads every supported parameter through verbatim", () => {
    const qs =
      "countryCode=ke&sectorKey=health&status=active&" +
      "organizationId=org1&organizationType=INGO&administrativeAreaId=a1&" +
      "donorId=d1&activeDuringYear=2024&budgetTier=MICRO,SMALL";
    const parsed = parseProjectFilterParams(new URLSearchParams(qs));
    expect(parsed.countryCode).toBe("ke");
    expect(parsed.sectorKey).toBe("health");
    expect(parsed.status).toBe("active");
    expect(parsed.organizationType).toBe("INGO");
    expect(parsed.activeDuringYear).toBe("2024");
    expect(parsed.budgetTier).toBe("MICRO,SMALL");
  });
});

describe("buildProjectFilterWhere — simple filters", () => {
  it("upper-cases country and sector codes", () => {
    const where = whereFrom("countryCode=ke&sectorKey=health");
    expect(where.countryCode).toBe("KE");
    expect(where.sectorKey).toBe("HEALTH");
  });

  it("upper-cases status to match ProjectStatus enum", () => {
    const where = whereFrom("status=active");
    expect(where.status).toBe("ACTIVE");
  });

  it("passes organizationId and administrativeAreaId through verbatim", () => {
    const where = whereFrom(
      "organizationId=org-123&administrativeAreaId=area-456&donorId=don-789",
    );
    expect(where.organizationId).toBe("org-123");
    expect(where.administrativeAreaId).toBe("area-456");
    expect(where.donorId).toBe("don-789");
  });

  it("produces an empty where when no params are supplied", () => {
    const where = whereFrom("");
    expect(where).toEqual({});
  });
});

describe("buildProjectFilterWhere — Active During Year", () => {
  it("produces inclusive-overlap clauses for a valid year", () => {
    const where = whereFrom("activeDuringYear=2024");
    expect(where.AND).toBeDefined();
    const andArr = where.AND as unknown[];
    expect(Array.isArray(andArr)).toBe(true);

    // Expect exactly two clauses: startDate <= yearEnd AND (endDate null OR endDate >= yearStart).
    // Year window is 2024-01-01..2024-12-31 UTC.
    const startClause = andArr.find(
      (c) => typeof c === "object" && c !== null && "startDate" in c,
    ) as { startDate: { lte: Date } } | undefined;
    const endClause = andArr.find(
      (c) => typeof c === "object" && c !== null && "OR" in c,
    ) as { OR: Array<Record<string, unknown>> } | undefined;

    expect(startClause).toBeDefined();
    expect(endClause).toBeDefined();

    const yearEnd = startClause?.startDate.lte as Date;
    expect(yearEnd.toISOString()).toBe("2024-12-31T23:59:59.999Z");

    const or = endClause?.OR as Array<Record<string, unknown>>;
    expect(or.length).toBe(2);
    expect(or).toContainEqual({ endDate: null });

    const gteClause = or.find((c) => {
      const e = (c as { endDate?: { gte?: Date } }).endDate;
      return e && typeof e === "object" && "gte" in e;
    }) as { endDate: { gte: Date } };
    expect(gteClause.endDate.gte.toISOString()).toBe(
      "2024-01-01T00:00:00.000Z",
    );
  });

  it("ignores non-numeric or out-of-range years", () => {
    expect(whereFrom("activeDuringYear=abc").AND).toBeUndefined();
    expect(whereFrom("activeDuringYear=1800").AND).toBeUndefined();
    expect(whereFrom("activeDuringYear=3000").AND).toBeUndefined();
  });
});

describe("buildProjectFilterWhere — budget tiers", () => {
  // Helper: extract the budget clauses from a built WHERE.
  function extractBudgetClauses(where: Record<string, unknown>): unknown {
    const and = (where.AND as Array<Record<string, unknown>>) ?? [];
    // Single-tier: budgetUsd directly on a clause.
    const singleTierClause = and.find((c) => "budgetUsd" in c);
    if (singleTierClause) return singleTierClause.budgetUsd;
    // Multi-tier: OR array whose entries are {budgetUsd: {...}}.
    const orClause = and.find((c) => "OR" in c) as
      | { OR: Array<{ budgetUsd: unknown }> }
      | undefined;
    return orClause ? orClause.OR.map((c) => c.budgetUsd) : null;
  }

  it("MICRO maps to budgetUsd < 50,000", () => {
    expect(extractBudgetClauses(whereFrom("budgetTier=MICRO"))).toEqual({
      lt: 50_000,
    });
  });

  it("SMALL maps to 50,000 ≤ budgetUsd < 500,000", () => {
    expect(extractBudgetClauses(whereFrom("budgetTier=SMALL"))).toEqual({
      gte: 50_000,
      lt: 500_000,
    });
  });

  it("MEDIUM maps to 500,000 ≤ budgetUsd < 2,000,000", () => {
    expect(extractBudgetClauses(whereFrom("budgetTier=MEDIUM"))).toEqual({
      gte: 500_000,
      lt: 2_000_000,
    });
  });

  it("LARGE maps to budgetUsd ≥ 2,000,000", () => {
    expect(extractBudgetClauses(whereFrom("budgetTier=LARGE"))).toEqual({
      gte: 2_000_000,
    });
  });

  it("accepts multiple tiers as an OR of ranges", () => {
    const clauses = extractBudgetClauses(
      whereFrom("budgetTier=MICRO,LARGE"),
    ) as Array<Record<string, unknown>>;
    expect(Array.isArray(clauses)).toBe(true);
    expect(clauses).toHaveLength(2);
    expect(clauses).toContainEqual({ lt: 50_000 });
    expect(clauses).toContainEqual({ gte: 2_000_000 });
  });

  it("silently drops unknown tier tokens", () => {
    // Only MEDIUM is a real tier; HUGE is invalid.
    const clauses = extractBudgetClauses(
      whereFrom("budgetTier=HUGE,MEDIUM"),
    );
    expect(clauses).toEqual({ gte: 500_000, lt: 2_000_000 });
  });

  it("produces no budget clause when every token is invalid", () => {
    const where = whereFrom("budgetTier=HUGE,GIGANTIC");
    // No AND should contain a budget clause; AND may still be undefined.
    const and = (where.AND as Array<Record<string, unknown>>) ?? [];
    expect(and.every((c) => !("budgetUsd" in c) && !("OR" in c))).toBe(true);
  });
});