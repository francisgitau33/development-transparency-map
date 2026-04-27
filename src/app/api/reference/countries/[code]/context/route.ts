/**
 * Country Development Context API (Prompt 8 · Part D).
 *
 * GET  /api/reference/countries/:code/context
 *   - Authenticated (any signed-in user; respects dashboard access).
 *   - Returns: country details, calculated population summary (from active
 *     Administrative Area records), indicator history grouped by key,
 *     recency flags, and context-completeness diagnostics.
 *
 * PUT  /api/reference/countries/:code/context
 *   - SYSTEM_OWNER only.
 *   - Body: { indicators: CountryIndicatorInput[] }
 *   - Applies UPSERT per (countryCode, indicatorKey, year).
 *   - Partial writes are supported: only rows present in the payload are
 *     touched. Nothing else is deleted.
 *
 * DELETE /api/reference/countries/:code/context?indicatorKey=…&year=…
 *   - SYSTEM_OWNER only.
 *   - Clears a single (key, year) row.
 *
 * Language:
 *   All response notes are neutral. Indicator values are presented as
 *   CONTEXTUAL data — never as proof of need / deprivation / effectiveness.
 */

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import {
  ALLOWED_INDICATOR_KEYS,
  buildCountryContextCompleteness,
  buildCountryIndicatorHistory,
  computeCountryPopulationSummary,
  COUNTRY_INDICATOR_DISPLAY_NOTE,
  COUNTRY_POPULATION_DISPLAY_NOTE,
  evaluateIndicatorRecency,
  INDICATOR_METADATA,
  INDICATOR_SECTIONS,
  isAllowedIndicatorKey,
  validateCountryIndicator,
  type CountryIndicatorInput,
} from "@/lib/country-context";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireSession(request: NextRequest) {
  void request; // future-proofing if we add per-request context.
  const session = await getSession();
  if (!session) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { role: true },
  });
  if (!user || !user.role) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user };
}

async function requireSystemOwner(request: NextRequest) {
  const res = await requireSession(request);
  if ("response" in res) return res;
  if (res.user.role?.role !== "SYSTEM_OWNER") {
    return {
      response: NextResponse.json(
        { error: "Only system owners can manage country context indicators" },
        { status: 403 },
      ),
    };
  }
  return { user: res.user };
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const auth = await requireSession(request);
    if ("response" in auth) return auth.response;

    const { code: rawCode } = await params;
    const code = rawCode.toUpperCase();

    const country = await prisma.referenceCountry.findUnique({
      where: { code },
    });
    if (!country) {
      return NextResponse.json({ error: "Country not found" }, { status: 404 });
    }

    const [areas, indicators] = await Promise.all([
      prisma.administrativeArea.findMany({
        where: { countryCode: code },
        select: {
          id: true,
          name: true,
          active: true,
          estimatedPopulation: true,
          populationYear: true,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.countryIndicator.findMany({
        where: { countryCode: code },
        orderBy: [{ indicatorKey: "asc" }, { year: "desc" }],
      }),
    ]);

    const populationSummary = computeCountryPopulationSummary(
      areas.map((a) => ({
        active: a.active,
        estimatedPopulation: a.estimatedPopulation,
        populationYear: a.populationYear,
      })),
    );

    const history = buildCountryIndicatorHistory(
      indicators.map((r) => ({
        indicatorKey: r.indicatorKey,
        year: r.year,
        value: r.value,
        rank: r.rank,
        unit: r.unit,
        source: r.source,
        sourceUrl: r.sourceUrl,
        notes: r.notes,
      })),
    );
    const recency = evaluateIndicatorRecency(history);
    const completeness = buildCountryContextCompleteness(
      history,
      populationSummary,
    );

    return NextResponse.json({
      country: {
        code: country.code,
        name: country.name,
        type: country.type,
        active: country.active,
      },
      populationSummary,
      indicators: history,
      recency,
      completeness,
      sections: INDICATOR_SECTIONS,
      allowedIndicatorKeys: ALLOWED_INDICATOR_KEYS,
      metadata: INDICATOR_METADATA,
      notes: [COUNTRY_INDICATOR_DISPLAY_NOTE, COUNTRY_POPULATION_DISPLAY_NOTE],
    });
  } catch (err) {
    console.error("[country-context][GET]", err);
    return NextResponse.json(
      { error: "Failed to fetch country context" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PUT (upsert a batch of indicators)
// ---------------------------------------------------------------------------

interface PutBody {
  indicators?: CountryIndicatorInput[];
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const auth = await requireSystemOwner(request);
    if ("response" in auth) return auth.response;
    const user = auth.user;

    const { code: rawCode } = await params;
    const code = rawCode.toUpperCase();

    const country = await prisma.referenceCountry.findUnique({
      where: { code },
    });
    if (!country) {
      return NextResponse.json({ error: "Country not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as PutBody;
    const indicators = Array.isArray(body.indicators) ? body.indicators : [];
    if (indicators.length === 0) {
      return NextResponse.json(
        {
          error:
            "Payload must include at least one indicator in `indicators`.",
        },
        { status: 400 },
      );
    }

    // Validate every row FIRST — refuse the entire batch if any row fails.
    // This keeps the audit log clean (no half-saved rows) and avoids
    // surprise state changes.
    const validated: Array<{
      indicatorKey: string;
      year: number;
      value: number | null;
      rank: number | null;
      unit: string | null;
      source: string | null;
      sourceUrl: string | null;
      notes: string | null;
    }> = [];
    const allErrors: Array<{ index: number; errors: string[] }> = [];
    for (let i = 0; i < indicators.length; i += 1) {
      const row = indicators[i];
      const outcome = validateCountryIndicator(row);
      if (!outcome.valid || !outcome.data) {
        allErrors.push({ index: i, errors: outcome.errors });
        continue;
      }
      validated.push(outcome.data);
    }
    if (allErrors.length > 0) {
      return NextResponse.json(
        { error: "Validation failed", details: allErrors },
        { status: 400 },
      );
    }

    // Upsert sequentially inside a transaction so the batch is atomic.
    const results = await prisma.$transaction(async (tx) => {
      const out = [];
      for (const row of validated) {
        const saved = await tx.countryIndicator.upsert({
          where: {
            countryCode_indicatorKey_year: {
              countryCode: code,
              indicatorKey: row.indicatorKey,
              year: row.year,
            },
          },
          update: {
            value: row.value,
            rank: row.rank,
            unit: row.unit,
            source: row.source,
            sourceUrl: row.sourceUrl,
            notes: row.notes,
          },
          create: {
            countryCode: code,
            indicatorKey: row.indicatorKey,
            year: row.year,
            value: row.value,
            rank: row.rank,
            unit: row.unit,
            source: row.source,
            sourceUrl: row.sourceUrl,
            notes: row.notes,
          },
        });
        out.push(saved);
      }
      return out;
    });

    // Best-effort audit — fire-and-forget.
    logAudit({
      actorId: user.id,
      actorEmail: user.email,
      action: "COUNTRY_CONTEXT_UPDATED",
      entityType: "ReferenceCountry",
      entityId: code,
      payload: {
        countryCode: code,
        upsertedCount: results.length,
        indicatorKeys: Array.from(new Set(validated.map((v) => v.indicatorKey))),
      },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      countryCode: code,
      upserted: results.length,
    });
  } catch (err) {
    console.error("[country-context][PUT]", err);
    return NextResponse.json(
      { error: "Failed to save country context" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE (clear a single indicator row)
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const auth = await requireSystemOwner(request);
    if ("response" in auth) return auth.response;
    const user = auth.user;

    const { code: rawCode } = await params;
    const code = rawCode.toUpperCase();

    const url = new URL(request.url);
    const indicatorKey = url.searchParams.get("indicatorKey") ?? "";
    const yearRaw = url.searchParams.get("year") ?? "";

    if (!isAllowedIndicatorKey(indicatorKey)) {
      return NextResponse.json(
        { error: "indicatorKey query parameter is required and must be valid" },
        { status: 400 },
      );
    }
    const year = Number.parseInt(yearRaw, 10);
    if (!Number.isFinite(year)) {
      return NextResponse.json(
        { error: "year query parameter is required and must be a whole number" },
        { status: 400 },
      );
    }

    try {
      await prisma.countryIndicator.delete({
        where: {
          countryCode_indicatorKey_year: {
            countryCode: code,
            indicatorKey,
            year,
          },
        },
      });
    } catch {
      return NextResponse.json(
        { error: "Indicator row not found" },
        { status: 404 },
      );
    }

    logAudit({
      actorId: user.id,
      actorEmail: user.email,
      action: "COUNTRY_CONTEXT_DELETED",
      entityType: "ReferenceCountry",
      entityId: code,
      payload: { countryCode: code, indicatorKey, year },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      countryCode: code,
      indicatorKey,
      year,
    });
  } catch (err) {
    console.error("[country-context][DELETE]", err);
    return NextResponse.json(
      { error: "Failed to delete country indicator" },
      { status: 500 },
    );
  }
}