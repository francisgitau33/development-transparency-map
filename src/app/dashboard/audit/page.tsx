"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { useAuth } from "@/lib/auth-context";
import { Shield, ChevronDown, ChevronRight, Filter } from "lucide-react";

interface AuditEvent {
  id: string;
  createdAt: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  payload: unknown;
}

interface AuditResponse {
  events: AuditEvent[];
  total: number;
  limit: number;
  maxLimit: number;
  facets: {
    actions: string[];
    entityTypes: string[];
  };
}

const ANY_VALUE = "__any__";
const LIMIT_OPTIONS = [25, 50, 100, 200, 500] as const;

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function PayloadViewer({ payload }: { payload: unknown }) {
  const [open, setOpen] = useState(false);
  if (payload === null || payload === undefined) {
    return <span className="text-xs text-slate-400 italic">—</span>;
  }
  let pretty: string;
  try {
    pretty = JSON.stringify(payload, null, 2);
  } catch {
    pretty = String(payload);
  }
  const single = pretty.length < 60 && !pretty.includes("\n");
  if (single) {
    return (
      <code className="text-xs text-slate-700 bg-slate-100 rounded px-1.5 py-0.5">
        {pretty}
      </code>
    );
  }
  return (
    <div data-design-id="audit-payload">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-1 text-xs text-sky-700 hover:text-sky-900"
      >
        {open ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        {open ? "Hide payload" : "View payload"}
      </button>
      {open ? (
        <pre className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded text-[11px] leading-relaxed text-slate-800 overflow-auto max-h-96 whitespace-pre-wrap break-words">
          {pretty}
        </pre>
      ) : null}
    </div>
  );
}

export default function AuditLogPage() {
  const router = useRouter();
  const { isSystemOwner, isLoading: authLoading } = useAuth();

  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterAction, setFilterAction] = useState<string>(ANY_VALUE);
  const [filterEntityType, setFilterEntityType] = useState<string>(ANY_VALUE);
  const [filterActorEmail, setFilterActorEmail] = useState<string>("");
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");
  const [limit, setLimit] = useState<number>(100);

  useEffect(() => {
    if (!authLoading && !isSystemOwner) {
      router.replace("/dashboard");
    }
  }, [authLoading, isSystemOwner, router]);

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (filterAction && filterAction !== ANY_VALUE)
      params.set("action", filterAction);
    if (filterEntityType && filterEntityType !== ANY_VALUE)
      params.set("entityType", filterEntityType);
    if (filterActorEmail.trim()) params.set("actorEmail", filterActorEmail.trim());
    if (filterFrom) {
      // Date input is yyyy-mm-dd. Treat as UTC start-of-day.
      params.set("from", new Date(`${filterFrom}T00:00:00Z`).toISOString());
    }
    if (filterTo) {
      params.set("to", new Date(`${filterTo}T23:59:59Z`).toISOString());
    }
    params.set("limit", String(limit));
    return `/api/audit-events?${params.toString()}`;
  }, [
    filterAction,
    filterEntityType,
    filterActorEmail,
    filterFrom,
    filterTo,
    limit,
  ]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildUrl());
      if (res.status === 403) {
        setError("You do not have permission to view the audit log.");
        setData(null);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? "Failed to load audit events.");
        setData(null);
        return;
      }
      const body = (await res.json()) as AuditResponse;
      setData(body);
    } catch {
      setError("Network error while loading audit events.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  useEffect(() => {
    if (authLoading) return;
    if (!isSystemOwner) return;
    fetchEvents();
  }, [authLoading, isSystemOwner, fetchEvents]);

  const resetFilters = () => {
    setFilterAction(ANY_VALUE);
    setFilterEntityType(ANY_VALUE);
    setFilterActorEmail("");
    setFilterFrom("");
    setFilterTo("");
    setLimit(100);
  };

  const actionOptions = useMemo(() => data?.facets.actions ?? [], [data]);
  const entityTypeOptions = useMemo(
    () => data?.facets.entityTypes ?? [],
    [data],
  );

  if (authLoading || !isSystemOwner) {
    return (
      <div data-design-id="audit-auth-check" className="p-8">
        <LoadingState message="Checking access..." />
      </div>
    );
  }

  return (
    <div data-design-id="audit-page" className="p-8 space-y-6">
      <div data-design-id="audit-header" className="space-y-1">
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-slate-700" />
          <h1
            data-design-id="audit-title"
            className="text-2xl font-bold text-slate-900"
          >
            Audit Log
          </h1>
        </div>
        <p className="text-sm text-slate-600 max-w-3xl">
          System-wide record of administrative and security-relevant events.
          Visible to System Owners only. Events are retained for investigation
          and compliance review.
        </p>
      </div>

      <Card data-design-id="audit-filters-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </CardTitle>
          <CardDescription>
            Narrow results by action, entity, actor, or date range. Up to{" "}
            {data?.maxLimit ?? 500} rows per request.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            data-design-id="audit-filters-form"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              fetchEvents();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="audit-filter-action">Action</Label>
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger id="audit-filter-action">
                  <SelectValue placeholder="Any action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_VALUE}>Any action</SelectItem>
                  {actionOptions.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="audit-filter-entity">Entity type</Label>
              <Select
                value={filterEntityType}
                onValueChange={setFilterEntityType}
              >
                <SelectTrigger id="audit-filter-entity">
                  <SelectValue placeholder="Any entity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_VALUE}>Any entity</SelectItem>
                  {entityTypeOptions.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="audit-filter-actor">Actor email contains</Label>
              <Input
                id="audit-filter-actor"
                type="search"
                placeholder="e.g. partner@example.org"
                value={filterActorEmail}
                onChange={(e) => setFilterActorEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="audit-filter-from">From</Label>
              <Input
                id="audit-filter-from"
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="audit-filter-to">To</Label>
              <Input
                id="audit-filter-to"
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="audit-filter-limit">Row limit</Label>
              <Select
                value={String(limit)}
                onValueChange={(v) => setLimit(Number.parseInt(v, 10))}
              >
                <SelectTrigger id="audit-filter-limit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIMIT_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2 lg:col-span-3 flex flex-wrap gap-3 pt-2">
              <Button type="submit" className="bg-sky-600 hover:bg-sky-700">
                Apply filters
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  resetFilters();
                }}
              >
                Reset
              </Button>
              {data ? (
                <span className="text-xs text-slate-500 self-center ml-auto">
                  Showing {data.events.length} of {data.total.toLocaleString()}{" "}
                  matching events
                </span>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card data-design-id="audit-results-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Events</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingState message="Loading audit events..." />
          ) : error ? (
            <ErrorState
              title="Unable to load audit log"
              message={error}
              onRetry={fetchEvents}
            />
          ) : !data || data.events.length === 0 ? (
            <div
              data-design-id="audit-empty"
              className="py-10 text-center text-sm text-slate-500"
            >
              No audit events match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table data-design-id="audit-table">
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">
                      Timestamp
                    </TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Entity ID</TableHead>
                    <TableHead className="min-w-[260px]">Payload</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.events.map((ev) => (
                    <TableRow key={ev.id} data-design-id={`audit-row-${ev.id}`}>
                      <TableCell className="align-top whitespace-nowrap text-xs tabular-nums text-slate-600">
                        {formatDateTime(ev.createdAt)}
                      </TableCell>
                      <TableCell className="align-top text-sm text-slate-800">
                        {ev.actorEmail ? (
                          <div className="flex flex-col">
                            <span>{ev.actorEmail}</span>
                            {ev.actorId ? (
                              <span className="text-[10px] text-slate-400">
                                {ev.actorId}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">
                            system
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge
                          variant="outline"
                          className="text-xs font-mono whitespace-nowrap"
                        >
                          {ev.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top text-sm text-slate-700">
                        {ev.entityType ?? (
                          <span className="text-xs text-slate-400 italic">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="align-top text-xs font-mono text-slate-600">
                        {ev.entityId ?? (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        <PayloadViewer payload={ev.payload} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}