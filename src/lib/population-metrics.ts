/**
 * Pure helpers for population-weighted spatial-vulnerability reporting
 * (see Prompt 7 / Part F).
 *
 * All functions in this module are:
 *   - SIDE-EFFECT FREE (no Prisma, no process.env, no I/O)
 *   - DETERMINISTIC for unit testing
 *   - STRICT about missing data — they never coerce a null/undefined
 *     population to zero or invent fallback values.
 *
 * Language rules (enforced in the return `note` strings and reason labels
 * generated here) match the neutral wording in PRD Prompt 7 · Part H:
 *
 *   - Do NOT say "underfunded", "neglected", or "no support exists".
 *   - DO say "Low recorded investment per capita",
 *     "Low recorded project density",
 *     "Requires further review",
 *     "Potentially underserved based on recorded data".
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Output for a per-capita calculation that may be unavailable. */
export type PopulationWeightedResult =
  | { kind: "value"; value: number }
  | {
      kind: "insufficient";
      // Stable machine-readable reason for conditional rendering.
      reason:
        | "missing-population"
        | "missing-budget"
        | "missing-beneficiaries"
        | "zero-population";
      // Neutral user-facing label rendered directly in UI tables.
      label: string;
    };

/**
 * Narrow "population completeness" bag used by the Data Quality widgets.
 * Callers compute this once per request from the reference list, then
 * render completeness % and a "missing population by country" summary.
 */
export interface PopulationCompleteness {
  totalActiveAreas: number;
  areasWithPopulation: number;
  areasMissingPopulation: number;
  completenessPercent: number | null;
  areasWithPopulationSource: number;
  populationSourceCompletenessPercent: number | null;
  populationYearMin: number | null;
  populationYearMax: number | null;
  populationYearSpread: number | null;
  populationYearMixedNote: string | null;
}

// ---------------------------------------------------------------------------
// Is the population value usable?
// ---------------------------------------------------------------------------

/**
 * True iff the recorded population is a finite integer and strictly > 0.
 * We never treat 0 or NaN as population data; the schema also rejects
 * zero, but we keep a defensive check here because this helper is a hot
 * path and runs on data loaded from the DB (which could be legacy rows
 * written before the validation was introduced).
 */
export function isUsablePopulation(value: number | null | undefined): boolean {
  return (
    typeof value === "number" && Number.isFinite(value) && value > 0
  );
}

// ---------------------------------------------------------------------------
// Per-capita / per-100k / beneficiary reach
// ---------------------------------------------------------------------------

/**
 * Recorded Investment per Capita = totalRecordedBudget / estimatedPopulation.
 *
 * Rules (PRD Part F.1):
 *   - Only calculate where estimatedPopulation > 0 AND totalRecordedBudget > 0.
 *   - Missing budget  → { kind: "insufficient", reason: "missing-budget" }
 *                        with label "Insufficient budget data".
 *   - Missing population → { kind: "insufficient", reason: "missing-population" }
 *                          with label "Population data missing".
 *   - Missing population is NEVER treated as zero.
 *   - Missing budget is NEVER treated as zero for ranking.
 */
export function recordedInvestmentPerCapita(
  totalRecordedBudget: number,
  estimatedPopulation: number | null | undefined,
): PopulationWeightedResult {
  if (!isUsablePopulation(estimatedPopulation)) {
    return {
      kind: "insufficient",
      reason: "missing-population",
      label: "Population data missing",
    };
  }
  if (
    !Number.isFinite(totalRecordedBudget) ||
    totalRecordedBudget <= 0
  ) {
    return {
      kind: "insufficient",
      reason: "missing-budget",
      label: "Insufficient budget data",
    };
  }
  return {
    kind: "value",
    value: totalRecordedBudget / (estimatedPopulation as number),
  };
}

/**
 * Recorded Projects per 100,000 People =
 *   activeOrPlannedProjectCount / estimatedPopulation × 100_000.
 *
 * Rules (PRD Part F.2):
 *   - Only calculate where estimatedPopulation > 0.
 *   - Zero active/planned count is a valid value (returns 0).
 */
export function projectsPer100k(
  activeOrPlannedProjectCount: number,
  estimatedPopulation: number | null | undefined,
): PopulationWeightedResult {
  if (!isUsablePopulation(estimatedPopulation)) {
    return {
      kind: "insufficient",
      reason: "missing-population",
      label: "Population data missing",
    };
  }
  if (
    !Number.isFinite(activeOrPlannedProjectCount) ||
    activeOrPlannedProjectCount < 0
  ) {
    return {
      kind: "insufficient",
      reason: "missing-beneficiaries", // coerced → generic insufficient
      label: "Insufficient project data",
    };
  }
  return {
    kind: "value",
    value:
      (activeOrPlannedProjectCount / (estimatedPopulation as number)) * 100_000,
  };
}

/**
 * Recorded Beneficiary Reach as % of Estimated Population =
 *   totalTargetBeneficiaries / estimatedPopulation × 100.
 *
 * Rules (PRD Part F.3):
 *   - Only calculate where estimatedPopulation > 0 AND
 *     totalTargetBeneficiaries > 0.
 *   - Values above 100% MAY occur (repeat contacts, overlapping groups) —
 *     callers must display an explanatory note.
 */
export function beneficiaryReachPercent(
  totalTargetBeneficiaries: number,
  estimatedPopulation: number | null | undefined,
): PopulationWeightedResult {
  if (!isUsablePopulation(estimatedPopulation)) {
    return {
      kind: "insufficient",
      reason: "missing-population",
      label: "Population data missing",
    };
  }
  if (
    !Number.isFinite(totalTargetBeneficiaries) ||
    totalTargetBeneficiaries <= 0
  ) {
    return {
      kind: "insufficient",
      reason: "missing-beneficiaries",
      label: "Insufficient beneficiary data",
    };
  }
  return {
    kind: "value",
    value:
      (totalTargetBeneficiaries / (estimatedPopulation as number)) * 100,
  };
}

// ---------------------------------------------------------------------------
// Quartile thresholds for population-weighted watchlist
// ---------------------------------------------------------------------------

/**
 * Build top-quartile (p75) and bottom-quartile (p25) thresholds for
 * population, investment-per-capita, projects-per-100k, and
 * beneficiary-reach-%. Skips areas with insufficient data — an area that
 * can't be ranked should not dominate the threshold selection.
 *
 * Returns `null` fields when the underlying sample is empty, which the
 * caller must interpret as "no ranking possible — do not flag".
 */
export interface PopulationQuartiles {
  populationTopQuartile: number | null; // p75 of estimatedPopulation where present
  investmentPerCapitaBottomQuartile: number | null;
  projectsPer100kBottomQuartile: number | null;
  beneficiaryReachBottomQuartile: number | null;
}

function quantileAsc(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

export function computePopulationQuartiles(input: {
  populations: number[]; // non-null, > 0 populations in scope
  investmentPerCapitaValues: number[];
  projectsPer100kValues: number[];
  beneficiaryReachValues: number[];
}): PopulationQuartiles {
  const popSorted = input.populations.slice().sort((a, b) => a - b);
  const ipcSorted = input.investmentPerCapitaValues
    .slice()
    .sort((a, b) => a - b);
  const ppkSorted = input.projectsPer100kValues.slice().sort((a, b) => a - b);
  const brSorted = input.beneficiaryReachValues.slice().sort((a, b) => a - b);
  return {
    populationTopQuartile: quantileAsc(popSorted, 0.75),
    investmentPerCapitaBottomQuartile: quantileAsc(ipcSorted, 0.25),
    projectsPer100kBottomQuartile: quantileAsc(ppkSorted, 0.25),
    beneficiaryReachBottomQuartile: quantileAsc(brSorted, 0.25),
  };
}

// ---------------------------------------------------------------------------
// High-population / low-recorded-coverage watchlist
// ---------------------------------------------------------------------------

export interface HighPopulationLowCoverageInput {
  estimatedPopulation: number | null | undefined;
  activeOrPlannedCount: number;
  investmentPerCapita: PopulationWeightedResult;
  projectsPer100k: PopulationWeightedResult;
  beneficiaryReachPercent: PopulationWeightedResult;
  quartiles: PopulationQuartiles;
}

/**
 * Build the list of transparent reason strings that place an area on the
 * "High Population / Low Recorded Coverage Watchlist".
 *
 * An area qualifies if any of the following are true (PRD Part F.4):
 *   1) Top-quartile population AND zero active/planned projects.
 *   2) Top-quartile population AND bottom-quartile investment per capita.
 *   3) Top-quartile population AND bottom-quartile projects per 100k.
 *   4) Population is recorded AND beneficiary reach % is in the bottom
 *      quartile of calculable areas.
 *
 * Reasons are the LITERAL user-facing strings from the PRD — do not
 * translate or re-phrase without also updating the spec and any tests.
 *
 * Returns an empty array when the area does not qualify.
 */
export function buildHighPopulationLowCoverageReasons(
  input: HighPopulationLowCoverageInput,
): string[] {
  const reasons: string[] = [];
  const pop = input.estimatedPopulation;
  const { quartiles } = input;

  const hasPop = isUsablePopulation(pop);
  const inTopQuartile =
    hasPop &&
    quartiles.populationTopQuartile !== null &&
    (pop as number) >= quartiles.populationTopQuartile;

  // Rule 1 — high population with zero active/planned
  if (inTopQuartile && input.activeOrPlannedCount === 0) {
    reasons.push("High population with no recorded active/planned projects");
  }

  // Rule 2 — high population with low IPC (only if IPC is calculable)
  if (
    inTopQuartile &&
    input.investmentPerCapita.kind === "value" &&
    quartiles.investmentPerCapitaBottomQuartile !== null &&
    input.investmentPerCapita.value <=
      quartiles.investmentPerCapitaBottomQuartile
  ) {
    reasons.push("High population with low recorded investment per capita");
  }

  // Rule 3 — high population with low projects/100k. Rule 3 requires the
  // area to actually have SOME coverage — if zero, Rule 1 already fires
  // and we don't double-flag.
  if (
    inTopQuartile &&
    input.activeOrPlannedCount > 0 &&
    input.projectsPer100k.kind === "value" &&
    quartiles.projectsPer100kBottomQuartile !== null &&
    input.projectsPer100k.value <=
      quartiles.projectsPer100kBottomQuartile
  ) {
    reasons.push("High population with low recorded project density");
  }

  // Rule 4 — any area with recorded population AND bottom-quartile reach %
  if (
    hasPop &&
    input.beneficiaryReachPercent.kind === "value" &&
    quartiles.beneficiaryReachBottomQuartile !== null &&
    input.beneficiaryReachPercent.value <=
      quartiles.beneficiaryReachBottomQuartile
  ) {
    reasons.push(
      "Low recorded beneficiary reach relative to estimated population",
    );
  }

  return reasons;
}

// ---------------------------------------------------------------------------
// Population completeness summary (Data Quality)
// ---------------------------------------------------------------------------

export interface CompletenessAreaInput {
  active: boolean;
  estimatedPopulation: number | null;
  populationYear: number | null;
  populationSource: string | null;
}

/**
 * Compute the Population Data Completeness summary for the active areas
 * currently in scope. "In scope" means the caller has already filtered
 * the reference list by country / district, so no filtering happens here.
 *
 * Definitions:
 *   - totalActiveAreas: count of input rows with active=true.
 *   - areasWithPopulation: count with usable estimatedPopulation > 0.
 *   - completenessPercent: areasWithPopulation / totalActiveAreas × 100
 *     (null if totalActiveAreas === 0).
 *   - populationYearMin / Max: over areas that have populationYear set.
 *   - populationYearMixedNote: surfaced if the year spread is > 10.
 */
export function computePopulationCompleteness(
  areas: CompletenessAreaInput[],
): PopulationCompleteness {
  const active = areas.filter((a) => a.active);
  const totalActiveAreas = active.length;
  let areasWithPopulation = 0;
  let areasWithPopulationSource = 0;
  let populationYearMin: number | null = null;
  let populationYearMax: number | null = null;

  for (const a of active) {
    if (isUsablePopulation(a.estimatedPopulation)) {
      areasWithPopulation += 1;
    }
    if (a.populationSource && a.populationSource.trim().length > 0) {
      areasWithPopulationSource += 1;
    }
    if (typeof a.populationYear === "number" && Number.isFinite(a.populationYear)) {
      if (populationYearMin === null || a.populationYear < populationYearMin) {
        populationYearMin = a.populationYear;
      }
      if (populationYearMax === null || a.populationYear > populationYearMax) {
        populationYearMax = a.populationYear;
      }
    }
  }

  const completenessPercent =
    totalActiveAreas > 0
      ? (areasWithPopulation / totalActiveAreas) * 100
      : null;

  const populationSourceCompletenessPercent =
    totalActiveAreas > 0
      ? (areasWithPopulationSource / totalActiveAreas) * 100
      : null;

  const populationYearSpread =
    populationYearMin !== null && populationYearMax !== null
      ? populationYearMax - populationYearMin
      : null;

  const populationYearMixedNote =
    populationYearSpread !== null && populationYearSpread > 10
      ? "Population estimates are drawn from different years and should be interpreted cautiously."
      : null;

  return {
    totalActiveAreas,
    areasWithPopulation,
    areasMissingPopulation: totalActiveAreas - areasWithPopulation,
    completenessPercent,
    areasWithPopulationSource,
    populationSourceCompletenessPercent,
    populationYearMin,
    populationYearMax,
    populationYearSpread,
    populationYearMixedNote,
  };
}