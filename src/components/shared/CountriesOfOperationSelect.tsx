"use client";

import { useMemo, useState } from "react";
import { Check, Globe, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

/**
 * Multi-country picker for the "Countries of Operation" field on
 * Organization create / edit forms.
 *
 * Canonical valid states:
 *   - scope = "ALL", countryIds = [] — global / multi-country INGO.
 *   - scope = "SELECTED", countryIds = [c1, c2, …] — one or more countries.
 *
 * Selection rules (enforced locally so the parent always receives a
 * canonical state):
 *   - Choosing "All Countries" clears every individual selection.
 *   - Choosing any individual country deselects "All Countries" (scope
 *     flips from ALL → SELECTED).
 *   - Removing the last individually-selected country does NOT auto-flip
 *     to ALL; the parent form is responsible for blocking submission
 *     when countryIds is empty and scope is SELECTED.
 */
export interface CountryOption {
  code: string;
  name: string;
}

export interface CountriesSelectState {
  scope: "ALL" | "SELECTED";
  ids: string[];
}

interface CountriesOfOperationSelectProps {
  countries: CountryOption[];
  scope: "ALL" | "SELECTED";
  selectedCodes: string[];
  /**
   * Replacement callback. Invoked with the fully computed next state.
   * Parents that cannot rely on freshly-rendered props during rapid
   * successive clicks should also pass `onUpdate` so the child can fall
   * back to a functional updater.
   */
  onChange: (scope: "ALL" | "SELECTED", selectedCodes: string[]) => void;
  /**
   * Optional functional updater used by toggleCountry / toggleAll when
   * present. Prevents stale-state bugs during rapid clicks (when React
   * has not yet re-rendered between two user clicks).
   */
  onUpdate?: (updater: (prev: CountriesSelectState) => CountriesSelectState) => void;
  id?: string;
  disabled?: boolean;
  /** Optional max visible rows before the list becomes scrollable. */
  maxListHeight?: number;
}

export function CountriesOfOperationSelect({
  countries,
  scope,
  selectedCodes,
  onChange,
  onUpdate,
  id = "countries-of-operation",
  disabled = false,
  maxListHeight = 240,
}: CountriesOfOperationSelectProps) {
  const [query, setQuery] = useState("");

  const selectedSet = useMemo(() => new Set(selectedCodes), [selectedCodes]);

  const sortedCountries = useMemo(
    () => [...countries].sort((a, b) => a.name.localeCompare(b.name)),
    [countries],
  );

  const filteredCountries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedCountries;
    return sortedCountries.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q),
    );
  }, [sortedCountries, query]);

  const codeToName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of countries) m.set(c.code, c.name);
    return m;
  }, [countries]);

  // Prefer the functional updater when the parent supplies one so we never
  // read stale `scope` / `selectedCodes` props under rapid successive
  // clicks (React 18 batches updates, so the props inside this component
  // don't refresh between synchronous clicks).
  const update = (fn: (prev: CountriesSelectState) => CountriesSelectState) => {
    if (onUpdate) {
      onUpdate(fn);
    } else {
      const next = fn({ scope, ids: selectedCodes });
      onChange(next.scope, next.ids);
    }
  };

  const toggleAll = () => {
    if (disabled) return;
    update((prev) =>
      prev.scope === "ALL"
        ? { scope: "SELECTED", ids: [] }
        : { scope: "ALL", ids: [] },
    );
  };

  const toggleCountry = (code: string) => {
    if (disabled) return;
    update((prev) => {
      if (prev.scope === "ALL") {
        // Individual selection auto-deselects "All Countries".
        return { scope: "SELECTED", ids: [code] };
      }
      if (prev.ids.includes(code)) {
        return { scope: "SELECTED", ids: prev.ids.filter((c) => c !== code) };
      }
      return { scope: "SELECTED", ids: [...prev.ids, code] };
    });
  };

  const removeCountry = (code: string) => {
    if (disabled) return;
    update((prev) => ({
      scope: "SELECTED",
      ids: prev.ids.filter((c) => c !== code),
    }));
  };

  const clearSelection = () => {
    if (disabled) return;
    update(() => ({ scope: "SELECTED", ids: [] }));
  };

  return (
    <div
      className="rounded-md border border-slate-200 bg-white"
      data-design-id={id}
    >
      {/* Summary / chips row */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 p-2 min-h-[44px]">
        {scope === "ALL" ? (
          <Badge
            variant="outline"
            className="bg-sky-50 border-sky-300 text-sky-800 flex items-center gap-1"
          >
            <Globe className="w-3 h-3" />
            All Countries
          </Badge>
        ) : selectedCodes.length === 0 ? (
          <span className="text-sm text-slate-400 px-1">
            No country selected
          </span>
        ) : (
          <>
            {selectedCodes.map((code) => (
              <Badge
                key={code}
                variant="outline"
                className="bg-slate-100 border-slate-300 text-slate-800 flex items-center gap-1"
              >
                {codeToName.get(code) || code}
                <button
                  type="button"
                  onClick={() => removeCountry(code)}
                  disabled={disabled}
                  aria-label={`Remove ${codeToName.get(code) || code}`}
                  className="ml-0.5 hover:text-slate-900 disabled:opacity-50"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
            <button
              type="button"
              onClick={clearSelection}
              disabled={disabled}
              className="text-xs text-slate-500 hover:text-slate-700 underline ml-auto px-1 disabled:opacity-50"
            >
              Clear
            </button>
          </>
        )}
      </div>

      {/* Search */}
      <div className="relative p-2 border-b border-slate-100">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <Input
          type="text"
          placeholder="Search countries..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled}
          className="pl-9 h-9"
          aria-label="Search countries"
        />
      </div>

      {/* Options list — we deliberately use native <button type=button>
          elements rather than role=listbox/role=option so the keyboard
          interaction stays "tab through, space/enter to toggle" which is
          the least-surprising pattern for a multi-select checkbox group. */}
      <div
        className="overflow-y-auto"
        style={{ maxHeight: maxListHeight }}
        aria-label="Countries of operation"
      >
        {/* All Countries sentinel — always first */}
        <button
          type="button"
          onClick={toggleAll}
          disabled={disabled}
          aria-pressed={scope === "ALL"}
          className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left border-b border-slate-100 hover:bg-sky-50 disabled:opacity-50 ${
            scope === "ALL" ? "bg-sky-50" : ""
          }`}
        >
          <span
            className={`w-4 h-4 rounded border flex items-center justify-center ${
              scope === "ALL"
                ? "bg-sky-600 border-sky-600"
                : "bg-white border-slate-300"
            }`}
          >
            {scope === "ALL" && <Check className="w-3 h-3 text-white" />}
          </span>
          <Globe className="w-4 h-4 text-sky-700" />
          <span className="font-medium text-slate-900">All Countries</span>
          <span className="text-xs text-slate-500 ml-auto">
            Global coverage
          </span>
        </button>

        {filteredCountries.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-slate-500">
            No countries match "{query}"
          </div>
        )}

        {filteredCountries.map((country) => {
          const checked = scope === "SELECTED" && selectedSet.has(country.code);
          return (
            <button
              key={country.code}
              type="button"
              onClick={() => toggleCountry(country.code)}
              disabled={disabled}
              aria-pressed={checked}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 disabled:opacity-50 ${
                checked ? "bg-slate-50" : ""
              }`}
            >
              <span
                className={`w-4 h-4 rounded border flex items-center justify-center ${
                  checked
                    ? "bg-sky-600 border-sky-600"
                    : "bg-white border-slate-300"
                }`}
              >
                {checked && <Check className="w-3 h-3 text-white" />}
              </span>
              <span className="text-slate-900">{country.name}</span>
              <span className="text-xs text-slate-400 ml-auto font-mono">
                {country.code}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Small helper to render an organization's country coverage as human-
 * readable text. Used by tables, detail views, and dashboards.
 */
export function formatOrganizationCountries(
  scope: "ALL" | "SELECTED",
  countryIds: string[],
  countries: CountryOption[],
): string {
  if (scope === "ALL") return "All Countries";
  if (countryIds.length === 0) return "—";
  const map = new Map(countries.map((c) => [c.code, c.name]));
  return countryIds.map((code) => map.get(code) || code).join(", ");
}