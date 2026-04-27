"use client";

/**
 * Country Development Context — System Owner management page.
 *
 * Corresponds to Prompt 8 · Part C. Provides a single-country editor for
 * the five contextual data points (GDP per capita, HDI score, HDI rank,
 * poverty rate, ODA). Country population is SHOWN here but is calculated
 * from Administrative Area records — it cannot be edited manually.
 *
 * SYSTEM_OWNER-only. Partner Admins redirected back to /dashboard.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Info, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { useAuth } from "@/lib/auth-context";

// ---------------------------------------------------------------------------
// Types mirrored from the API response (see src/lib/country-context.ts).
// ---------------------------------------------------------------------------

type IndicatorKey =
  | "GDP_PER_CAPITA_CURRENT_USD"
  | "HDI_SCORE"
  | "HDI_RANK"
  | "POVERTY_RATE"
  | "ODA_RECEIVED_PER_CAPITA"
  | "ODA_AS_PERCENT_GNI";

interface IndicatorMeta {
  key: IndicatorKey;
  label: string;
  shortLabel: string;
  defaultUnit: string | null;
  useRank?: boolean;
  useValue?: boolean;
}

interface IndicatorHistoryEntry {
  year: number;
  value: number | null;
  rank: number | null;
  unit: string | null;
  source: string | null;
  sourceUrl: string | null;
  notes: string | null;
}

interface IndicatorHistoryGroup {
  indicatorKey: IndicatorKey;
  label: string;
  shortLabel: string;
  defaultUnit: string | null;
  history: IndicatorHistoryEntry[];
  latest: IndicatorHistoryEntry | null;
}

interface PopulationSummary {
  calculatedPopulation: number | null;
  activeAdministrativeAreas: number;
  administrativeAreasWithPopulation: number;
  administrativeAreasMissingPopulation: number;
  populationCompletenessPercent: number | null;
  populationYearMin: number | null;
  populationYearMax: number | null;
  understatedWarning: boolean;
  note: string;
}

interface ContextResponse {
  country: { code: string; name: string; type: string; active: boolean };
  populationSummary: PopulationSummary;
  indicators: Record<IndicatorKey, IndicatorHistoryGroup>;
  completeness: {
    missingIndicatorLabels: string[];
    outdatedIndicatorLabels: string[];
    warning: string | null;
  };
  metadata: Record<IndicatorKey, IndicatorMeta>;
  notes: string[];
}

interface RowDraft {
  year: string;
  value: string;
  rank: string;
  unit: string;
  source: string;
  sourceUrl: string;
  notes: string;
  existing: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_ROWS = 5;

const SECTIONS: Array<{
  id: string;
  title: string;
  description: string;
  keys: IndicatorKey[];
}> = [
  {
    id: "gdp",
    title: "GDP per capita, current USD",
    description:
      "Contextual indicator. Source suggestions: World Bank or national statistics office.",
    keys: ["GDP_PER_CAPITA_CURRENT_USD"],
  },
  {
    id: "hdi",
    title: "Human Development Index",
    description:
      "HDI score (0–1) and country rank. Source: UNDP Human Development Reports.",
    keys: ["HDI_SCORE", "HDI_RANK"],
  },
  {
    id: "poverty",
    title: "Poverty rate",
    description:
      "Stated methodology varies — record the source poverty line / headcount ratio in notes.",
    keys: ["POVERTY_RATE"],
  },
  {
    id: "oda",
    title: "ODA received",
    description:
      "Either indicator (or both) is accepted. Sources: OECD, World Bank, or national aid-management platform.",
    keys: ["ODA_RECEIVED_PER_CAPITA", "ODA_AS_PERCENT_GNI"],
  },
];

function formatNumber(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function toRowDraft(entry: IndicatorHistoryEntry | null, meta: IndicatorMeta): RowDraft {
  return {
    year: entry ? String(entry.year) : "",
    value: entry?.value !== null && entry?.value !== undefined ? String(entry.value) : "",
    rank: entry?.rank !== null && entry?.rank !== undefined ? String(entry.rank) : "",
    unit: entry?.unit ?? meta.defaultUnit ?? "",
    source: entry?.source ?? "",
    sourceUrl: entry?.sourceUrl ?? "",
    notes: entry?.notes ?? "",
    existing: !!entry,
  };
}

function emptyRow(meta: IndicatorMeta): RowDraft {
  return {
    year: "",
    value: "",
    rank: "",
    unit: meta.defaultUnit ?? "",
    source: "",
    sourceUrl: "",
    notes: "",
    existing: false,
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CountryContextPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = (params?.code ?? "").toUpperCase();
  const { isSystemOwner, isLoading: authLoading } = useAuth();

  const [data, setData] = useState<ContextResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<IndicatorKey | null>(null);

  // Per-indicator draft rows (up to MAX_ROWS each).
  const [drafts, setDrafts] = useState<Record<IndicatorKey, RowDraft[]>>(
    () => ({}) as Record<IndicatorKey, RowDraft[]>,
  );

  useEffect(() => {
    if (!authLoading && !isSystemOwner) {
      router.replace("/dashboard");
    }
  }, [authLoading, isSystemOwner, router]);

  const fetchContext = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reference/countries/${code}/context`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Country not found");
        throw new Error("Failed to load country context");
      }
      const body = (await res.json()) as ContextResponse;
      setData(body);
      // Seed drafts from the history we just loaded.
      const next = {} as Record<IndicatorKey, RowDraft[]>;
      (Object.keys(body.metadata) as IndicatorKey[]).forEach((key) => {
        const meta = body.metadata[key];
        const history = body.indicators[key]?.history ?? [];
        const rows =
          history.length > 0
            ? history.map((h) => toRowDraft(h, meta))
            : [emptyRow(meta)];
        next[key] = rows;
      });
      setDrafts(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load country context");
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    if (isSystemOwner && code) {
      fetchContext();
    }
  }, [isSystemOwner, code, fetchContext]);

  const updateDraft = useCallback(
    (key: IndicatorKey, idx: number, patch: Partial<RowDraft>) => {
      setDrafts((prev) => {
        const rows = [...(prev[key] ?? [])];
        rows[idx] = { ...rows[idx], ...patch };
        return { ...prev, [key]: rows };
      });
    },
    [],
  );

  const addYearRow = useCallback(
    (key: IndicatorKey) => {
      if (!data) return;
      setDrafts((prev) => {
        const rows = [...(prev[key] ?? [])];
        if (rows.length >= MAX_ROWS) return prev;
        rows.push(emptyRow(data.metadata[key]));
        return { ...prev, [key]: rows };
      });
    },
    [data],
  );

  const removeDraftRow = useCallback(
    async (key: IndicatorKey, idx: number) => {
      if (!data) return;
      const row = drafts[key]?.[idx];
      if (!row) return;

      // If the row was persisted, call DELETE endpoint.
      if (row.existing && row.year) {
        try {
          setSavingKey(key);
          const res = await fetch(
            `/api/reference/countries/${code}/context?indicatorKey=${encodeURIComponent(
              key,
            )}&year=${encodeURIComponent(row.year)}`,
            { method: "DELETE" },
          );
          if (!res.ok && res.status !== 404) {
            const msg = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(msg.error || "Failed to delete indicator");
          }
          toast.success("Indicator value removed");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Delete failed");
          setSavingKey(null);
          return;
        }
        setSavingKey(null);
      }

      // Remove from draft state (ensure at least one empty row remains).
      setDrafts((prev) => {
        const rows = [...(prev[key] ?? [])];
        rows.splice(idx, 1);
        if (rows.length === 0) rows.push(emptyRow(data.metadata[key]));
        return { ...prev, [key]: rows };
      });

      // Re-fetch to pick up completeness + recency flags.
      await fetchContext();
    },
    [code, data, drafts, fetchContext],
  );

  const saveSection = useCallback(
    async (section: (typeof SECTIONS)[number]) => {
      if (!data) return;
      const indicators: Array<Record<string, unknown>> = [];
      for (const key of section.keys) {
        const meta = data.metadata[key];
        const rows = drafts[key] ?? [];
        for (const row of rows) {
          const yearRaw = row.year.trim();
          const valueRaw = row.value.trim();
          const rankRaw = row.rank.trim();
          const hasYear = yearRaw !== "";
          const hasValue = valueRaw !== "";
          const hasRank = rankRaw !== "";
          const requiresValue = meta.useValue && !meta.useRank;
          const requiresRank = meta.useRank && !meta.useValue;

          // Skip completely empty rows silently.
          if (!hasYear && !hasValue && !hasRank && !row.source && !row.notes) continue;

          // If the user supplied year but no value/rank, refuse.
          if (hasYear && requiresValue && !hasValue) {
            toast.error(`Enter a value for ${meta.label} ${yearRaw}, or clear the year.`);
            return;
          }
          if (hasYear && requiresRank && !hasRank) {
            toast.error(`Enter a rank for ${meta.label} ${yearRaw}, or clear the year.`);
            return;
          }
          if (!hasYear) {
            toast.error(`Each ${meta.label} row requires a year.`);
            return;
          }

          indicators.push({
            indicatorKey: key,
            year: yearRaw,
            value: hasValue ? valueRaw : null,
            rank: hasRank ? rankRaw : null,
            unit: row.unit.trim() || null,
            source: row.source.trim() || null,
            sourceUrl: row.sourceUrl.trim() || null,
            notes: row.notes.trim() || null,
          });
        }
      }

      if (indicators.length === 0) {
        toast.error("Add at least one year of data before saving.");
        return;
      }

      try {
        setSavingKey(section.keys[0]);
        const res = await fetch(`/api/reference/countries/${code}/context`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ indicators }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          details?: Array<{ index: number; errors: string[] }>;
        };
        if (!res.ok) {
          if (body.details?.length) {
            const flat = body.details
              .map((d) => `Row ${d.index + 1}: ${d.errors.join("; ")}`)
              .join(" • ");
            throw new Error(flat || body.error || "Validation failed");
          }
          throw new Error(body.error || "Failed to save");
        }
        toast.success(`${section.title} saved`);
        await fetchContext();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSavingKey(null);
      }
    },
    [code, data, drafts, fetchContext],
  );

  const populationSummary = data?.populationSummary;

  const completenessPercent = useMemo(() => {
    if (!populationSummary?.populationCompletenessPercent) return null;
    return Math.round(populationSummary.populationCompletenessPercent);
  }, [populationSummary]);

  if (authLoading || !isSystemOwner) return null;

  return (
    <div data-design-id="cms-country-context-page" className="p-8 space-y-6">
      <div className="flex items-center">
        <Link href="/dashboard/cms/countries">
          <Button variant="ghost" size="sm" className="mr-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Country Development Context
          </h1>
          <p className="text-slate-600 text-sm">
            {data ? `${data.country.name} (${data.country.code})` : code}
          </p>
        </div>
      </div>

      {loading && <LoadingState message="Loading country context..." />}
      {error && <ErrorState message={error} onRetry={fetchContext} />}

      {!loading && !error && data && (
        <>
          {/* Neutral interpretation notes — always visible. */}
          <div
            data-design-id="country-context-notes"
            className="flex items-start gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2"
          >
            <Info className="w-4 h-4 mt-0.5 text-slate-500 shrink-0" />
            <div className="space-y-1">
              {data.notes.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </div>
          </div>

          {/* Population summary — calculated, read-only */}
          <Card data-design-id="country-context-population">
            <CardHeader>
              <CardTitle>Population summary</CardTitle>
              <CardDescription>
                Calculated from active Administrative Area records in the
                platform. Country population cannot be edited directly here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 text-sm">
                <div>
                  <div className="text-xs text-slate-500">
                    Calculated country population
                  </div>
                  <div className="text-lg font-semibold text-slate-900 tabular-nums">
                    {populationSummary?.calculatedPopulation !== null
                      ? formatNumber(populationSummary?.calculatedPopulation ?? null)
                      : "Population data unavailable"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Active districts / counties</div>
                  <div className="text-lg font-semibold tabular-nums">
                    {populationSummary?.activeAdministrativeAreas ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">With population data</div>
                  <div className="text-lg font-semibold tabular-nums">
                    {populationSummary?.administrativeAreasWithPopulation ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Missing population data</div>
                  <div className="text-lg font-semibold tabular-nums text-amber-700">
                    {populationSummary?.administrativeAreasMissingPopulation ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Completeness</div>
                  <div className="text-lg font-semibold tabular-nums">
                    {completenessPercent !== null ? `${completenessPercent}%` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Year range</div>
                  <div className="text-lg font-semibold tabular-nums">
                    {populationSummary?.populationYearMin && populationSummary?.populationYearMax
                      ? populationSummary.populationYearMin === populationSummary.populationYearMax
                        ? `${populationSummary.populationYearMin}`
                        : `${populationSummary.populationYearMin}–${populationSummary.populationYearMax}`
                      : "—"}
                  </div>
                </div>
              </div>
              {populationSummary?.understatedWarning && (
                <p className="mt-3 text-xs text-amber-700">
                  {populationSummary.note}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Completeness flags */}
          {(data.completeness.missingIndicatorLabels.length > 0 ||
            data.completeness.outdatedIndicatorLabels.length > 0) && (
            <Card data-design-id="country-context-completeness">
              <CardHeader>
                <CardTitle className="text-base">Context completeness</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                {data.completeness.missingIndicatorLabels.length > 0 && (
                  <div>
                    <div className="text-slate-500 text-xs">Missing indicators</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {data.completeness.missingIndicatorLabels.map((l) => (
                        <Badge key={l} variant="outline" className="bg-slate-50">
                          {l}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {data.completeness.outdatedIndicatorLabels.length > 0 && (
                  <div>
                    <div className="text-slate-500 text-xs">
                      Latest value older than five years
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {data.completeness.outdatedIndicatorLabels.map((l) => (
                        <Badge
                          key={l}
                          variant="outline"
                          className="bg-amber-50 border-amber-200 text-amber-800"
                        >
                          {l}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {data.completeness.warning && (
                  <p className="text-xs text-slate-600">{data.completeness.warning}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Indicator editors */}
          {SECTIONS.map((section) => (
            <Card
              key={section.id}
              data-design-id={`country-context-section-${section.id}`}
            >
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {section.keys.map((key) => {
                  const meta = data.metadata[key];
                  const rows = drafts[key] ?? [];
                  return (
                    <div key={key} className="space-y-3">
                      {section.keys.length > 1 && (
                        <h3 className="text-sm font-semibold text-slate-800">
                          {meta.label}
                        </h3>
                      )}
                      {rows.map((row, idx) => (
                        <div
                          key={`${key}-${idx}`}
                          className="rounded-md border border-slate-200 p-3 grid grid-cols-1 md:grid-cols-12 gap-2 text-sm"
                        >
                          <div className="md:col-span-2 grid gap-1">
                            <Label>Year</Label>
                            <Input
                              type="number"
                              inputMode="numeric"
                              placeholder="2024"
                              value={row.year}
                              onChange={(e) =>
                                updateDraft(key, idx, { year: e.target.value })
                              }
                            />
                          </div>
                          {meta.useValue && (
                            <div className="md:col-span-2 grid gap-1">
                              <Label>Value</Label>
                              <Input
                                type="number"
                                step="any"
                                inputMode="decimal"
                                placeholder={meta.defaultUnit ?? ""}
                                value={row.value}
                                onChange={(e) =>
                                  updateDraft(key, idx, { value: e.target.value })
                                }
                              />
                            </div>
                          )}
                          {meta.useRank && (
                            <div className="md:col-span-2 grid gap-1">
                              <Label>Rank</Label>
                              <Input
                                type="number"
                                inputMode="numeric"
                                placeholder="e.g. 166"
                                value={row.rank}
                                onChange={(e) =>
                                  updateDraft(key, idx, { rank: e.target.value })
                                }
                              />
                            </div>
                          )}
                          <div className="md:col-span-2 grid gap-1">
                            <Label>Unit</Label>
                            <Input
                              placeholder={meta.defaultUnit ?? "—"}
                              value={row.unit}
                              onChange={(e) =>
                                updateDraft(key, idx, { unit: e.target.value })
                              }
                            />
                          </div>
                          <div className="md:col-span-4 grid gap-1">
                            <Label>Source</Label>
                            <Input
                              placeholder="e.g. World Bank WDI 2024"
                              value={row.source}
                              onChange={(e) =>
                                updateDraft(key, idx, { source: e.target.value })
                              }
                            />
                          </div>
                          <div className="md:col-span-12 grid gap-1">
                            <Label>Source URL</Label>
                            <Input
                              type="url"
                              placeholder="https://..."
                              value={row.sourceUrl}
                              onChange={(e) =>
                                updateDraft(key, idx, { sourceUrl: e.target.value })
                              }
                            />
                          </div>
                          <div className="md:col-span-11 grid gap-1">
                            <Label>Notes</Label>
                            <Textarea
                              rows={2}
                              placeholder="Optional methodology / caveats"
                              value={row.notes}
                              onChange={(e) =>
                                updateDraft(key, idx, { notes: e.target.value })
                              }
                            />
                          </div>
                          <div className="md:col-span-1 flex md:justify-end md:items-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeDraftRow(key, idx)}
                              title="Remove this year"
                              disabled={savingKey !== null}
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addYearRow(key)}
                          disabled={rows.length >= MAX_ROWS || savingKey !== null}
                        >
                          + Add year
                        </Button>
                        <p className="text-xs text-slate-500">
                          Up to {MAX_ROWS} years per indicator.
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div className="flex justify-end">
                  <Button
                    onClick={() => saveSection(section)}
                    disabled={savingKey !== null}
                    className="bg-sky-600 hover:bg-sky-700"
                  >
                    <Save className="w-4 h-4 mr-1" />
                    {savingKey === section.keys[0] ? "Saving..." : "Save"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}