/**
 * Country Development Context — pure helpers.
 *
 * This module underpins Prompt 8 ("Country Development Context Profile").
 * It is DELIBERATELY free of I/O: every function here works on plain data
 * so that route handlers, CMS pages, and the vitest suite can all share
 * exactly the same logic without hitting Prisma.
 *
 * CORE PRINCIPLE — the five data points are CONTEXTUAL INDICATORS, not
 * proof of need, deprivation, donor dependency, or effectiveness. Every
 * display must include source + year. Mock / unsourced values must never
 * be presented as official statistics. See the notes at the bottom of
 * this file for the standard caveat strings re-used by the API and UI.
 *
 * Covered in this file:
 *   - ALLOWED_INDICATOR_KEYS (controlled vocabulary)
 *   - Per-key range / unit rules and user-facing labels
 *   - validateCountryIndicator() — shared by the write API and UI
 *   - computeCountryPopulationSummary() — calculated (never stored) from
 *     Administrative Area records
 *   - buildCountryIndicatorHistory() — groups indicator rows by key, sorts,
 *     trims to last N years, and exposes "latest"/recency flags
 *   - evaluateIndicatorRecency() — "older than five years" helper used by
 *     Data Quality
 *   - buildCountryContextCompleteness() — which key indicators are present
 *
 * NOTE: Country population is calculated from District / County records
 * only. There is NO code path that allows a manually-entered country
 * population to be stored.
 */

// ---------------------------------------------------------------------------
// Controlled vocabulary
// ---------------------------------------------------------------------------

/**
 * Allowed indicator keys. Sixth indicator (Business Environment / Business
 * Ready) is INTENTIONALLY NOT here — Prompt 8 reserves it for a future
 * phase. Adding a new key requires updating this list + the metadata
 * block below.
 */
export const ALLOWED_INDICATOR_KEYS = [
  "GDP_PER_CAPITA_CURRENT_USD",
  "HDI_SCORE",
  "HDI_RANK",
  "POVERTY_RATE",
  "ODA_RECEIVED_PER_CAPITA",
  "ODA_AS_PERCENT_GNI",
] as const;

export type IndicatorKey = (typeof ALLOWED_INDICATOR_KEYS)[number];

export function isAllowedIndicatorKey(key: unknown): key is IndicatorKey {
  return (
    typeof key === "string" &&
    (ALLOWED_INDICATOR_KEYS as readonly string[]).includes(key)
  );
}

/**
 * Metadata block per indicator key. Drives:
 *   - human-readable labels in the CMS + Reports UI,
 *   - default unit hint,
 *   - numeric validation bounds (min/max) applied to the `value` field,
 *   - whether `rank` is stored for this key (HDI only).
 *
 * Ranges are DELIBERATELY generous — the UI should warn but we do NOT want
 * to block a System Owner who records an indicator reported by a source
 * that happens to fall just outside a textbook range.
 */
export interface IndicatorMeta {
  key: IndicatorKey;
  label: string;
  shortLabel: string;
  defaultUnit: string | null;
  valueMin?: number;
  valueMax?: number;
  /** When true, the indicator carries an integer `rank`. */
  useRank?: boolean;
  /** When true, the indicator carries a numeric `value`. */
  useValue?: boolean;
  /**
   * If value exceeds `valueMax`, validation fails. If undefined, no upper
   * bound (used by GDP per capita, ODA per capita).
   */
  neutralDescription: string;
}

export const INDICATOR_METADATA: Record<IndicatorKey, IndicatorMeta> = {
  GDP_PER_CAPITA_CURRENT_USD: {
    key: "GDP_PER_CAPITA_CURRENT_USD",
    label: "GDP per capita, current USD",
    shortLabel: "GDP per capita (USD)",
    defaultUnit: "USD",
    valueMin: 0,
    useValue: true,
    neutralDescription:
      "GDP per capita in current US dollars. A contextual indicator — does not imply project need or effectiveness on its own.",
  },
  HDI_SCORE: {
    key: "HDI_SCORE",
    label: "HDI score",
    shortLabel: "HDI score",
    defaultUnit: null,
    valueMin: 0,
    valueMax: 1,
    useValue: true,
    neutralDescription:
      "Human Development Index score (0–1). A contextual indicator compiled by UNDP.",
  },
  HDI_RANK: {
    key: "HDI_RANK",
    label: "HDI rank",
    shortLabel: "HDI rank",
    defaultUnit: null,
    useRank: true,
    neutralDescription:
      "Human Development Index country ranking. Lower numbers indicate higher HDI score, not a judgement of development.",
  },
  POVERTY_RATE: {
    key: "POVERTY_RATE",
    label: "Poverty rate",
    shortLabel: "Poverty rate",
    defaultUnit: "%",
    valueMin: 0,
    valueMax: 100,
    useValue: true,
    neutralDescription:
      "Reported poverty rate (%). Interpret with reference to the stated poverty line and methodology.",
  },
  ODA_RECEIVED_PER_CAPITA: {
    key: "ODA_RECEIVED_PER_CAPITA",
    label: "ODA received per capita",
    shortLabel: "ODA per capita",
    defaultUnit: "USD",
    valueMin: 0,
    useValue: true,
    neutralDescription:
      "Official development assistance received, per capita. Contextual indicator; does not prove donor dependency.",
  },
  ODA_AS_PERCENT_GNI: {
    key: "ODA_AS_PERCENT_GNI",
    label: "ODA as % of GNI",
    shortLabel: "ODA / GNI (%)",
    defaultUnit: "%",
    valueMin: 0,
    // Net ODA received occasionally exceeds 100% of GNI in fragile states;
    // we still enforce a very generous upper bound to catch typos.
    valueMax: 500,
    useValue: true,
    neutralDescription:
      "Official development assistance expressed as a percentage of Gross National Income.",
  },
};

/**
 * Logical sections used by the CMS / Reports UI. HDI groups score + rank
 * under one heading; ODA groups the two optional ODA keys.
 */
export const INDICATOR_SECTIONS: Array<{
  id: string;
  label: string;
  keys: IndicatorKey[];
}> = [
  {
    id: "gdp",
    label: "GDP per capita, current USD",
    keys: ["GDP_PER_CAPITA_CURRENT_USD"],
  },
  {
    id: "hdi",
    label: "Human Development Index",
    keys: ["HDI_SCORE", "HDI_RANK"],
  },
  {
    id: "poverty",
    label: "Poverty rate",
    keys: ["POVERTY_RATE"],
  },
  {
    id: "oda",
    label: "ODA received",
    keys: ["ODA_RECEIVED_PER_CAPITA", "ODA_AS_PERCENT_GNI"],
  },
];

export const MAX_YEARS_PER_INDICATOR = 5;
export const OUTDATED_YEAR_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface CountryIndicatorInput {
  indicatorKey: string;
  year: number | string;
  value?: number | string | null;
  rank?: number | string | null;
  unit?: string | null;
  source?: string | null;
  sourceUrl?: string | null;
  notes?: string | null;
}

export interface CountryIndicatorNormalized {
  indicatorKey: IndicatorKey;
  year: number;
  value: number | null;
  rank: number | null;
  unit: string | null;
  source: string | null;
  sourceUrl: string | null;
  notes: string | null;
}

export interface ValidationOutcome {
  valid: boolean;
  errors: string[];
  data?: CountryIndicatorNormalized;
}

function parseOptionalNumber(raw: unknown): { ok: true; value: number | null } | { ok: false } {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }
  let n: number;
  if (typeof raw === "number") {
    n = raw;
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") return { ok: true, value: null };
    n = Number(trimmed);
  } else {
    return { ok: false };
  }
  if (!Number.isFinite(n)) return { ok: false };
  return { ok: true, value: n };
}

function parseOptionalInt(raw: unknown): { ok: true; value: number | null } | { ok: false } {
  const parsed = parseOptionalNumber(raw);
  if (!parsed.ok) return { ok: false };
  if (parsed.value === null) return { ok: true, value: null };
  if (!Number.isInteger(parsed.value)) return { ok: false };
  return { ok: true, value: parsed.value };
}

/**
 * Validate a single country-indicator write.
 *
 * Rules (per Prompt 8 Part D):
 *   - indicatorKey must be in ALLOWED_INDICATOR_KEYS (case-sensitive).
 *   - year must be an integer in [1900, currentYear + 1].
 *   - value / rank / unit / source / sourceUrl / notes are all optional
 *     but we apply the per-indicator range checks when present.
 *   - For HDI_RANK, at least `rank` must be provided (otherwise the row
 *     would be empty); for other keys with useValue, at least `value`
 *     must be provided. Rows with no data are rejected (use DELETE
 *     instead of creating empty rows).
 *   - sourceUrl must start with http:// or https:// if provided.
 *   - Length caps on source / sourceUrl / notes match the AdministrativeArea
 *     population fields for consistency.
 */
export function validateCountryIndicator(
  input: CountryIndicatorInput,
  now: Date = new Date(),
): ValidationOutcome {
  const errors: string[] = [];

  const keyRaw = typeof input.indicatorKey === "string" ? input.indicatorKey.trim() : "";
  if (!isAllowedIndicatorKey(keyRaw)) {
    errors.push(
      `indicatorKey must be one of: ${ALLOWED_INDICATOR_KEYS.join(", ")}`,
    );
  }

  const yearParsed = parseOptionalInt(input.year);
  let year: number | null = null;
  if (!yearParsed.ok || yearParsed.value === null) {
    errors.push("year is required and must be a whole number");
  } else {
    year = yearParsed.value;
    const maxYear = now.getUTCFullYear() + 1;
    if (year < 1900 || year > maxYear) {
      errors.push(`year must be between 1900 and ${maxYear}`);
    }
  }

  const valueParsed = parseOptionalNumber(input.value);
  let value: number | null = null;
  if (!valueParsed.ok) {
    errors.push("value must be numeric");
  } else {
    value = valueParsed.value;
  }

  const rankParsed = parseOptionalInt(input.rank);
  let rank: number | null = null;
  if (!rankParsed.ok) {
    errors.push("rank must be a whole number");
  } else {
    rank = rankParsed.value;
    if (rank !== null && rank <= 0) {
      errors.push("rank must be a positive integer");
    }
  }

  // Per-key range checks.
  if (isAllowedIndicatorKey(keyRaw)) {
    const meta = INDICATOR_METADATA[keyRaw];
    if (meta.useValue && value !== null) {
      if (meta.valueMin !== undefined && value < meta.valueMin) {
        errors.push(`${meta.label} must be ≥ ${meta.valueMin}`);
      }
      if (meta.valueMax !== undefined && value > meta.valueMax) {
        errors.push(`${meta.label} must be ≤ ${meta.valueMax}`);
      }
    }
    // HDI_RANK: rank must be present.
    if (meta.useRank && !meta.useValue && rank === null) {
      errors.push(`${meta.label} requires a rank`);
    }
    // Value-carrying indicators must have a value (unless rank is present,
    // which is not possible for non-HDI indicators).
    if (meta.useValue && !meta.useRank && value === null) {
      errors.push(`${meta.label} requires a value`);
    }
  }

  const unitRaw = typeof input.unit === "string" ? input.unit.trim() : "";
  if (unitRaw.length > 64) errors.push("unit is too long (max 64 characters)");

  const sourceRaw = typeof input.source === "string" ? input.source.trim() : "";
  if (sourceRaw.length > 512) errors.push("source is too long (max 512 characters)");

  const sourceUrlRaw = typeof input.sourceUrl === "string" ? input.sourceUrl.trim() : "";
  if (sourceUrlRaw) {
    if (!/^https?:\/\//i.test(sourceUrlRaw)) {
      errors.push("sourceUrl must start with http:// or https://");
    }
    if (sourceUrlRaw.length > 2048) {
      errors.push("sourceUrl is too long (max 2048 characters)");
    }
  }

  const notesRaw = typeof input.notes === "string" ? input.notes.trim() : "";
  if (notesRaw.length > 2000) {
    errors.push("notes are too long (max 2000 characters)");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    data: {
      indicatorKey: keyRaw as IndicatorKey,
      year: year as number,
      value,
      rank,
      unit: unitRaw || INDICATOR_METADATA[keyRaw as IndicatorKey].defaultUnit,
      source: sourceRaw || null,
      sourceUrl: sourceUrlRaw || null,
      notes: notesRaw || null,
    },
  };
}

// ---------------------------------------------------------------------------
// Country population summary (CALCULATED, never stored)
// ---------------------------------------------------------------------------

export interface AdministrativeAreaForCountry {
  active: boolean;
  estimatedPopulation: number | null;
  populationYear: number | null;
}

export interface CountryPopulationSummary {
  /** Sum of estimatedPopulation across active areas with population > 0. */
  calculatedPopulation: number | null;
  activeAdministrativeAreas: number;
  administrativeAreasWithPopulation: number;
  administrativeAreasMissingPopulation: number;
  populationCompletenessPercent: number | null;
  populationYearMin: number | null;
  populationYearMax: number | null;
  /** Whether the calculated total may be understated by missing records. */
  understatedWarning: boolean;
  /** Standard caveat string attached to every country-context response. */
  note: string;
}

export const COUNTRY_POPULATION_CALC_NOTE =
  "Country population is calculated from District / County population records. Missing District / County population estimates may understate the calculated total.";

export const COUNTRY_INDICATOR_DISPLAY_NOTE =
  "Country context indicators are manually entered and should be interpreted with reference to their stated source and year.";

export const COUNTRY_POPULATION_DISPLAY_NOTE =
  "Country population is calculated from District / County population records in the platform and may be understated if population data is incomplete.";

/**
 * Calculate the country-level population summary from a list of
 * AdministrativeArea records.
 *
 * Rules (Prompt 8 Part B):
 *   - Only active areas count.
 *   - Population must be > 0 to be summed ("missing" is preserved, never
 *     coerced to zero).
 *   - Completeness % = withPopulation / activeAreas × 100.
 *   - If no active area carries a usable population, calculatedPopulation
 *     returns null and the UI shows "Population data unavailable."
 *   - understatedWarning is true whenever at least one active area is
 *     missing population data (completeness < 100%).
 */
export function computeCountryPopulationSummary(
  areas: AdministrativeAreaForCountry[],
): CountryPopulationSummary {
  const active = areas.filter((a) => a.active);
  let withPop = 0;
  let missingPop = 0;
  let total = 0;
  let yearMin: number | null = null;
  let yearMax: number | null = null;

  for (const a of active) {
    const pop = a.estimatedPopulation;
    const popUsable =
      pop !== null && Number.isFinite(pop) && (pop as number) > 0;
    if (popUsable) {
      withPop += 1;
      total += pop as number;
      if (
        a.populationYear !== null &&
        Number.isFinite(a.populationYear)
      ) {
        if (yearMin === null || (a.populationYear as number) < yearMin) {
          yearMin = a.populationYear as number;
        }
        if (yearMax === null || (a.populationYear as number) > yearMax) {
          yearMax = a.populationYear as number;
        }
      }
    } else {
      missingPop += 1;
    }
  }

  const activeCount = active.length;
  const completeness =
    activeCount > 0 ? (withPop / activeCount) * 100 : null;

  return {
    calculatedPopulation: withPop > 0 ? total : null,
    activeAdministrativeAreas: activeCount,
    administrativeAreasWithPopulation: withPop,
    administrativeAreasMissingPopulation: missingPop,
    populationCompletenessPercent: completeness,
    populationYearMin: yearMin,
    populationYearMax: yearMax,
    understatedWarning: missingPop > 0,
    note: COUNTRY_POPULATION_CALC_NOTE,
  };
}

// ---------------------------------------------------------------------------
// Indicator history + recency
// ---------------------------------------------------------------------------

export interface CountryIndicatorRow {
  indicatorKey: string;
  year: number;
  value: number | null;
  rank: number | null;
  unit: string | null;
  source: string | null;
  sourceUrl: string | null;
  notes: string | null;
}

export interface IndicatorHistoryEntry {
  year: number;
  value: number | null;
  rank: number | null;
  unit: string | null;
  source: string | null;
  sourceUrl: string | null;
  notes: string | null;
}

export interface IndicatorHistory {
  indicatorKey: IndicatorKey;
  label: string;
  shortLabel: string;
  defaultUnit: string | null;
  /** Descending by year, capped to MAX_YEARS_PER_INDICATOR. */
  history: IndicatorHistoryEntry[];
  /** Most recent entry (may be null if no rows). */
  latest: IndicatorHistoryEntry | null;
}

/**
 * Group raw CountryIndicator rows by indicatorKey. Only rows whose key is
 * in ALLOWED_INDICATOR_KEYS are returned; unknown keys are silently
 * skipped so stale rows from a rolled-back code change never leak into
 * the UI. Within each group, history is sorted by year descending and
 * capped to MAX_YEARS_PER_INDICATOR.
 */
export function buildCountryIndicatorHistory(
  rows: CountryIndicatorRow[],
): Record<IndicatorKey, IndicatorHistory> {
  const result = {} as Record<IndicatorKey, IndicatorHistory>;
  for (const key of ALLOWED_INDICATOR_KEYS) {
    const meta = INDICATOR_METADATA[key];
    result[key] = {
      indicatorKey: key,
      label: meta.label,
      shortLabel: meta.shortLabel,
      defaultUnit: meta.defaultUnit,
      history: [],
      latest: null,
    };
  }
  for (const r of rows) {
    if (!isAllowedIndicatorKey(r.indicatorKey)) continue;
    result[r.indicatorKey].history.push({
      year: r.year,
      value: r.value,
      rank: r.rank,
      unit: r.unit,
      source: r.source,
      sourceUrl: r.sourceUrl,
      notes: r.notes,
    });
  }
  for (const key of ALLOWED_INDICATOR_KEYS) {
    const entry = result[key];
    entry.history.sort((a, b) => b.year - a.year);
    entry.history = entry.history.slice(0, MAX_YEARS_PER_INDICATOR);
    entry.latest = entry.history[0] ?? null;
  }
  return result;
}

export interface IndicatorRecencyFlag {
  indicatorKey: IndicatorKey;
  label: string;
  latestYear: number | null;
  yearsSinceLatest: number | null;
  outdated: boolean;
  missing: boolean;
}

/**
 * Evaluate each indicator's recency relative to a reference year.
 * "Outdated" means the latest recorded year is older than
 * OUTDATED_YEAR_THRESHOLD (5) years from the reference year. "Missing"
 * means no rows exist. An indicator can be both missing and not
 * outdated (the neutral language still says "missing" in that case).
 */
export function evaluateIndicatorRecency(
  history: Record<IndicatorKey, IndicatorHistory>,
  referenceYear: number = new Date().getUTCFullYear(),
): IndicatorRecencyFlag[] {
  return ALLOWED_INDICATOR_KEYS.map((key) => {
    const entry = history[key];
    const latest = entry.latest;
    if (!latest) {
      return {
        indicatorKey: key,
        label: INDICATOR_METADATA[key].label,
        latestYear: null,
        yearsSinceLatest: null,
        outdated: false,
        missing: true,
      };
    }
    const yearsSince = referenceYear - latest.year;
    return {
      indicatorKey: key,
      label: INDICATOR_METADATA[key].label,
      latestYear: latest.year,
      yearsSinceLatest: yearsSince,
      outdated: yearsSince > OUTDATED_YEAR_THRESHOLD,
      missing: false,
    };
  });
}

// ---------------------------------------------------------------------------
// Country context completeness (Data Quality)
// ---------------------------------------------------------------------------

export interface CountryContextCompleteness {
  gdpPerCapitaPresent: boolean;
  hdiPresent: boolean;
  povertyRatePresent: boolean;
  /** True if either ODA per capita OR ODA as % of GNI has a latest value. */
  odaPresent: boolean;
  /** Keys whose latest value is missing. */
  missingIndicatorLabels: string[];
  /** Keys whose latest value is older than five years from referenceYear. */
  outdatedIndicatorLabels: string[];
  /** Neutral warning to surface in Data Quality when anything is missing or outdated. */
  warning: string | null;
  /** Population completeness derived from the AdministrativeArea summary. */
  populationCompletenessPercent: number | null;
}

export const COUNTRY_CONTEXT_DATA_QUALITY_WARNING =
  "Some country context indicators are missing or outdated. Interpret country-level comparisons cautiously.";

export function buildCountryContextCompleteness(
  history: Record<IndicatorKey, IndicatorHistory>,
  populationSummary: CountryPopulationSummary,
  referenceYear: number = new Date().getUTCFullYear(),
): CountryContextCompleteness {
  const recency = evaluateIndicatorRecency(history, referenceYear);
  const recencyByKey = new Map(recency.map((r) => [r.indicatorKey, r] as const));

  const hasLatest = (key: IndicatorKey) => !recencyByKey.get(key)?.missing;
  const gdpPerCapitaPresent = hasLatest("GDP_PER_CAPITA_CURRENT_USD");
  // HDI is "present" if either score OR rank has a latest row.
  const hdiPresent = hasLatest("HDI_SCORE") || hasLatest("HDI_RANK");
  const povertyRatePresent = hasLatest("POVERTY_RATE");
  const odaPresent =
    hasLatest("ODA_RECEIVED_PER_CAPITA") ||
    hasLatest("ODA_AS_PERCENT_GNI");

  const missingIndicatorLabels: string[] = [];
  if (!gdpPerCapitaPresent)
    missingIndicatorLabels.push(INDICATOR_METADATA.GDP_PER_CAPITA_CURRENT_USD.label);
  if (!hdiPresent) missingIndicatorLabels.push("HDI score / rank");
  if (!povertyRatePresent)
    missingIndicatorLabels.push(INDICATOR_METADATA.POVERTY_RATE.label);
  if (!odaPresent)
    missingIndicatorLabels.push("ODA received (per capita or % of GNI)");

  const outdatedIndicatorLabels = recency
    .filter((r) => !r.missing && r.outdated)
    .map((r) => r.label);

  const hasIssue =
    missingIndicatorLabels.length > 0 || outdatedIndicatorLabels.length > 0;

  return {
    gdpPerCapitaPresent,
    hdiPresent,
    povertyRatePresent,
    odaPresent,
    missingIndicatorLabels,
    outdatedIndicatorLabels,
    warning: hasIssue ? COUNTRY_CONTEXT_DATA_QUALITY_WARNING : null,
    populationCompletenessPercent:
      populationSummary.populationCompletenessPercent,
  };
}