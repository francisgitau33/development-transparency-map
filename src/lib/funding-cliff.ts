/**
 * Pure helpers for the Funding Cliff / Temporal Vulnerability report.
 *
 * Extracted from src/app/api/reports/funding-cliffs/route.ts (see Prompt 6 ·
 * Part C). Only the small, side-effect-free functions needed for unit
 * testing have been moved here. The route handler remains the single
 * composer of a full response.
 *
 * NOTHING in this file reads process.env, touches Prisma, or performs I/O.
 */

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type RiskLevel =
  | "Low"
  | "Moderate"
  | "High"
  | "Severe"
  | "Insufficient data";

export interface ProjectForCliff {
  status: string;
  budgetUsd: number | null;
  startDate: Date | null;
  endDate: Date | null;
}

export interface CliffRowInput {
  key: string;
  name: string;
  subLabel?: string | null;
  activeBudget: number;
  expiringBudget: number;
  plannedReplacementBudget: number;
  activeProjectCount: number;
  expiringProjectCount: number;
}

export interface CliffRow extends CliffRowInput {
  netExposure: number;
  cliffRiskPercent: number | null;
  riskLevel: RiskLevel;
}

// -----------------------------------------------------------------------------
// Window parsing
// -----------------------------------------------------------------------------

export const SUPPORTED_WINDOWS = new Set([6, 12, 18, 24]);
export const DEFAULT_WINDOW = 12;

export function parseWindowMonths(raw: string | null): number {
  if (!raw) return DEFAULT_WINDOW;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_WINDOW;
  return SUPPORTED_WINDOWS.has(n) ? n : DEFAULT_WINDOW;
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

// -----------------------------------------------------------------------------
// Project status helpers
// -----------------------------------------------------------------------------

/**
 * An "active" project, for cliff purposes, is currently running:
 *   status === ACTIVE, OR startDate ≤ today AND endDate ≥ today.
 * Completed projects are ALWAYS excluded.
 */
export function isActive(p: ProjectForCliff, today: Date): boolean {
  if (p.status === "COMPLETED") return false;
  if (p.status === "ACTIVE") return true;
  if (p.startDate && p.endDate) {
    return (
      p.startDate.getTime() <= today.getTime() &&
      p.endDate.getTime() >= today.getTime()
    );
  }
  return false;
}

export function hasUsableDates(p: ProjectForCliff): boolean {
  if (!p.startDate || !p.endDate) return false;
  return p.endDate.getTime() >= p.startDate.getTime();
}

export function hasUsableBudget(p: ProjectForCliff): boolean {
  return (
    p.budgetUsd !== null &&
    Number.isFinite(p.budgetUsd) &&
    (p.budgetUsd as number) > 0
  );
}

// -----------------------------------------------------------------------------
// Risk classification
// -----------------------------------------------------------------------------

/**
 * Classify a cliff percentage into a risk band.
 *
 * Deliberately conservative: when the percentage is null (typically because
 * activeBudget is zero or unavailable) we return "Insufficient data" rather
 * than defaulting to Low. This prevents the UI from implying a confident
 * "safe" result when we have no basis for one.
 */
export function classifyRisk(cliffRiskPercent: number | null): RiskLevel {
  if (cliffRiskPercent === null || !Number.isFinite(cliffRiskPercent)) {
    return "Insufficient data";
  }
  if (cliffRiskPercent <= 25) return "Low";
  if (cliffRiskPercent <= 50) return "Moderate";
  if (cliffRiskPercent <= 75) return "High";
  return "Severe";
}

// -----------------------------------------------------------------------------
// Row builder
// -----------------------------------------------------------------------------

/**
 * Build a single cliff row from its pre-aggregated budget / project counts.
 *
 *   netExposure       = max(expiringBudget - plannedReplacementBudget, 0)
 *   cliffRiskPercent  = activeBudget > 0
 *                         ? (netExposure / activeBudget) × 100
 *                         : null
 *   riskLevel         = classifyRisk(cliffRiskPercent)
 */
export function buildCliffRow(params: CliffRowInput): CliffRow {
  const netExposure = Math.max(
    params.expiringBudget - params.plannedReplacementBudget,
    0,
  );
  const cliffRiskPercent =
    params.activeBudget > 0 ? (netExposure / params.activeBudget) * 100 : null;
  return {
    ...params,
    subLabel: params.subLabel ?? null,
    netExposure,
    cliffRiskPercent,
    riskLevel: classifyRisk(cliffRiskPercent),
  };
}