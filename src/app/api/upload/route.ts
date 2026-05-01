import { type NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { validateProject } from "@/lib/validation";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import {
  checkRateLimit,
  getClientIp,
  RATE_LIMITS,
  rateLimitedResponse,
} from "@/lib/rate-limit";

/**
 * Canonical CSV header set accepted by the upload route.
 *
 * Split into REQUIRED vs OPTIONAL so the server can reject uploads that
 * are missing critical columns BEFORE row-level validation is run. This
 * matches the template string shipped from the /dashboard/upload page.
 *
 * When adding a new column:
 *   - Update the template in src/app/dashboard/upload/page.tsx.
 *   - Update this set.
 *   - Update src/lib/validation.ts if the column is validated.
 */
const REQUIRED_CSV_HEADERS = [
  "title",
  "countryCode",
  "sectorKey",
  "status",
  "startDate",
  "latitude",
  "longitude",
] as const;

const OPTIONAL_CSV_HEADERS = [
  "description",
  "endDate",
  "budgetUsd",
  "targetBeneficiaries",
  "adminArea1",
  "adminArea2",
  "districtCounty",
  "donor",
  "locationName",
  "dataSource",
  "contactEmail",
] as const;

/**
 * Server-side row-count cap. Uploads above this threshold are rejected
 * with 413 before ANY row-level work runs — protects DB + memory.
 */
const MAX_UPLOAD_ROWS = 10_000;

interface CSVRow {
  title?: string;
  description?: string;
  countryCode?: string;
  sectorKey?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  latitude?: string;
  longitude?: string;
  budgetUsd?: string;
  targetBeneficiaries?: string;
  adminArea1?: string;
  adminArea2?: string;
  locationName?: string;
  dataSource?: string;
  contactEmail?: string;
  // New reference-data columns. Supplied by name; resolved to ids below.
  districtCounty?: string;
  donor?: string;
}

interface RowError {
  row: number;
  errors: string[];
  data: CSVRow;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Per-user upload rate limit. Falls back to IP if no user context —
    // which should not happen post-auth but we defend in depth.
    const uploadRl = checkRateLimit({
      bucket: "upload",
      key: session.userId || getClientIp(request),
      limit: RATE_LIMITS.upload.limit,
      windowMs: RATE_LIMITS.upload.windowMs,
    });
    if (!uploadRl.success) return rateLimitedResponse(uploadRl);

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { role: true },
    });

    if (!user?.role) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    let organizationId = user.role.organizationId;

    if (user.role.role === "PARTNER_ADMIN" && !organizationId) {
      return NextResponse.json(
        { error: "You are not associated with an organization" },
        { status: 403 }
      );
    }

    // The client is expected to send the PapaParse result:
    //   { rows: Record<string,string>[], organizationId?, headers?: string[] }
    // `headers` is the array reported by PapaParse (results.meta.fields).
    // We treat it as the source of truth for "what columns were present"
    // because row-level access always returns a value for each declared
    // field (even if empty), which would make the check below useless.
    const body = (await request.json()) as {
      rows?: unknown;
      organizationId?: string;
      headers?: unknown;
    };
    const { rows, organizationId: reqOrgId } = body;
    const headers = Array.isArray(body.headers)
      ? (body.headers as string[])
      : undefined;

    if (user.role.role === "SYSTEM_OWNER" && reqOrgId) {
      organizationId = reqOrgId;
    }

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required" },
        { status: 400 }
      );
    }

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: "No data rows provided" },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------------------
    // Server-side row-count cap. Reject oversized uploads BEFORE anything
    // else touches the DB. Returns 413 (Payload Too Large).
    // ---------------------------------------------------------------------
    if (rows.length > MAX_UPLOAD_ROWS) {
      return NextResponse.json(
        {
          error:
            "CSV file is too large. Please reduce the number of rows and try again.",
          maxRows: MAX_UPLOAD_ROWS,
          submittedRows: rows.length,
        },
        { status: 413 },
      );
    }

    // ---------------------------------------------------------------------
    // Required-header validation. We prefer the explicit `headers` array
    // reported by PapaParse. If the client did not send one (older clients,
    // hand-crafted requests), we fall back to the keys of the first row.
    // Either way, we short-circuit with 400 + `missingHeaders[]` BEFORE any
    // row-level work runs, so missing columns are NOT reported as thousands
    // of repeated row-level errors.
    // ---------------------------------------------------------------------
    const detectedHeaders = new Set<string>(
      (headers?.filter((h) => typeof h === "string" && h.trim().length > 0) ??
        (rows.length > 0 && typeof rows[0] === "object" && rows[0] !== null
          ? Object.keys(rows[0] as Record<string, unknown>)
          : [])
      ).map((h) => h.trim()),
    );

    const missingHeaders = REQUIRED_CSV_HEADERS.filter(
      (h) => !detectedHeaders.has(h),
    );

    if (missingHeaders.length > 0) {
      return NextResponse.json(
        {
          error: "CSV upload is missing required columns.",
          missingHeaders,
          requiredHeaders: REQUIRED_CSV_HEADERS,
          optionalHeaders: OPTIONAL_CSV_HEADERS,
        },
        { status: 400 },
      );
    }

    // Reference-data reads for CSV validation. The active + non-deleted
    // invariant is spelled out explicitly (`active: true, deletedAt: null`)
    // so soft-deleted rows can never be resolved to a valid upload target.
    // AdministrativeArea and Donor are still fetched unfiltered so the
    // validator can emit a precise "not active" error for rows that exist
    // but are hidden (soft-deleted or deactivated) instead of the vaguer
    // "not found".
    const [countries, sectors, organization, allAreas, allDonors] =
      await Promise.all([
        prisma.referenceCountry.findMany({
          where: { active: true, deletedAt: null },
        }),
        prisma.referenceSector.findMany({
          where: { active: true, deletedAt: null },
        }),
        prisma.organization.findUnique({
          where: { id: organizationId },
          include: {
            operatingCountries: { select: { countryCode: true } },
          },
        }),
        prisma.administrativeArea.findMany(),
        prisma.donor.findMany(),
      ]);

    if (!organization) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 400 }
      );
    }

    const countrySet = new Set(countries.map((c) => c.code));
    const sectorSet = new Set(sectors.map((s) => s.key));

    // Organization country-of-operation scope check. Organizations marked
    // as "ALL Countries" (countryScope = ALL) can upload projects for any
    // country. Organizations with countryScope = SELECTED can only upload
    // projects whose countryCode is in their OrganizationCountry[] set.
    // Legacy rows with no join rows fall back to organization.countryCode.
    const orgCountryScope: "ALL" | "SELECTED" =
      organization.countryScope === "ALL" ? "ALL" : "SELECTED";
    const orgAllowedCountries = new Set<string>();
    if (orgCountryScope === "SELECTED") {
      const joinRows = organization.operatingCountries ?? [];
      if (joinRows.length > 0) {
        for (const row of joinRows) orgAllowedCountries.add(row.countryCode);
      } else if (organization.countryCode) {
        // Legacy fallback for orgs that pre-date the multi-country backfill.
        orgAllowedCountries.add(organization.countryCode);
      }
    }

    // Index admin areas by (countryCode, lowercased name) for O(1) resolution.
    // We deliberately keep inactive rows too so we can emit a distinct
    // "not active" error rather than "not found".
    const areaIndex = new Map<string, (typeof allAreas)[number]>();
    for (const a of allAreas) {
      areaIndex.set(`${a.countryCode}::${a.name.toLowerCase()}`, a);
    }

    // Donor name is globally unique; index case-insensitively.
    const donorIndex = new Map<string, (typeof allDonors)[number]>();
    for (const d of allDonors) {
      donorIndex.set(d.name.toLowerCase(), d);
    }

    const validRows: unknown[] = [];
    const errorRows: RowError[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as CSVRow;
      const rowNum = i + 2;
      const errors: string[] = [];

      const countryCode = row.countryCode?.toUpperCase().trim();
      const sectorKey = row.sectorKey?.toUpperCase().trim();
      const countryName =
        countries.find((c) => c.code === countryCode)?.name || countryCode;

      if (countryCode && !countrySet.has(countryCode)) {
        errors.push(`Invalid country code: ${countryCode}`);
      }

      // Cross-check: the row's country must be in the organization's
      // country-of-operation scope. ALL-scope orgs accept any valid
      // country; SELECTED-scope orgs accept only their assigned subset.
      if (
        countryCode &&
        countrySet.has(countryCode) &&
        orgCountryScope === "SELECTED" &&
        !orgAllowedCountries.has(countryCode)
      ) {
        errors.push(
          `Organization '${organization.name}' is not configured to operate in ${countryName || countryCode}. Update the organization's Countries of Operation or choose "All Countries".`,
        );
      }

      if (sectorKey && !sectorSet.has(sectorKey)) {
        errors.push(`Invalid sector: ${sectorKey}`);
      }

      // Resolve districtCounty → administrativeAreaId by name, country-scoped.
      // CSV upload deliberately does NOT auto-create districts/counties or
      // donors — the System Owner must create them first.
      let administrativeAreaId: string | undefined;
      const districtName = row.districtCounty?.trim();
      if (districtName) {
        if (!countryCode || !countrySet.has(countryCode)) {
          errors.push(
            `District / County '${districtName}' cannot be resolved because the country is missing or invalid.`,
          );
        } else {
          const found = areaIndex.get(
            `${countryCode}::${districtName.toLowerCase()}`,
          );
          if (!found) {
            errors.push(
              `District / County '${districtName}' was not found for country '${countryName}'.`,
            );
          } else if (!found.active || found.deletedAt !== null) {
            // Soft-deleted rows (`deletedAt != null`) are treated as
            // inactive so they cannot be resolved by a CSV upload.
            errors.push(
              `District / County '${districtName}' is not active.`,
            );
          } else {
            administrativeAreaId = found.id;
          }
        }
      }

      // Resolve donor → donorId by name.
      let donorId: string | undefined;
      const donorName = row.donor?.trim();
      if (donorName) {
        const found = donorIndex.get(donorName.toLowerCase());
        if (!found) {
          errors.push(`Donor '${donorName}' was not found or is inactive.`);
        } else if (!found.active || found.deletedAt !== null) {
          // Soft-deleted donors (`deletedAt != null`) are rejected the
          // same way as deactivated donors.
          errors.push(`Donor '${donorName}' is not active.`);
        } else {
          donorId = found.id;
        }
      }

      const projectData = {
        title: row.title,
        description: row.description,
        organizationId,
        countryCode,
        sectorKey,
        status: row.status?.toUpperCase().trim(),
        startDate: row.startDate,
        endDate: row.endDate,
        latitude: row.latitude,
        longitude: row.longitude,
        budgetUsd: row.budgetUsd,
        targetBeneficiaries: row.targetBeneficiaries,
        adminArea1: row.adminArea1,
        adminArea2: row.adminArea2,
        administrativeAreaId,
        donorId,
        locationName: row.locationName,
        dataSource: row.dataSource,
        contactEmail: row.contactEmail,
      };

      const validation = validateProject(projectData);

      if (!validation.valid) {
        errors.push(...validation.errors);
      }

      if (errors.length > 0) {
        errorRows.push({ row: rowNum, errors, data: row });
      } else if (validation.normalizedData) {
        // Visibility defaults: CSV rows created by a Partner Admin start in
        // PENDING_REVIEW; System Owner bulk uploads default to PUBLISHED.
        const rowVisibility =
          user.role.role === "SYSTEM_OWNER" ? "PUBLISHED" : "PENDING_REVIEW";
        validRows.push({
          ...validation.normalizedData,
          organizationId,
          visibility: rowVisibility,
          createdByUserId: session.userId,
          startDate: new Date(validation.normalizedData.startDate as string),
          endDate: validation.normalizedData.endDate
            ? new Date(validation.normalizedData.endDate as string)
            : null,
        });
      }
    }

    const uploadJob = await prisma.uploadJob.create({
      data: {
        uploadedByUserId: session.userId,
        organizationId,
        status: "PROCESSING",
        totalRows: rows.length,
        validRows: validRows.length,
        invalidRows: errorRows.length,
        errorReport:
          errorRows.length > 0
            ? (errorRows as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
      },
    });

    let createdCount = 0;

    if (validRows.length > 0) {
      try {
        const result = await prisma.project.createMany({
          data: validRows as never[],
          skipDuplicates: true,
        });
        createdCount = result.count;

        await prisma.uploadJob.update({
          where: { id: uploadJob.id },
          data: { status: "COMPLETED" },
        });
      } catch (error) {
        console.error("Bulk insert error:", error);
        await prisma.uploadJob.update({
          where: { id: uploadJob.id },
          data: { status: "FAILED" },
        });
      }
    } else {
      await prisma.uploadJob.update({
        where: { id: uploadJob.id },
        data: { status: "COMPLETED" },
      });
    }

    await logAudit({
      actorId: session.userId,
      actorEmail: user.email,
      action: AUDIT_ACTIONS.UPLOAD_COMPLETED,
      entityType: "UploadJob",
      entityId: uploadJob.id,
      payload: {
        organizationId,
        totalRows: rows.length,
        validRows: validRows.length,
        invalidRows: errorRows.length,
        createdProjects: createdCount,
        actorRole: user.role.role,
      },
    });

    return NextResponse.json({
      uploadJobId: uploadJob.id,
      totalRows: rows.length,
      validRows: validRows.length,
      invalidRows: errorRows.length,
      createdProjects: createdCount,
      errors: errorRows,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Upload failed. Please try again." },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { role: true },
    });

    if (!user?.role) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const where: Record<string, unknown> = {};

    if (user.role.role === "PARTNER_ADMIN" && user.role.organizationId) {
      where.organizationId = user.role.organizationId;
    }

    const uploadJobs = await prisma.uploadJob.findMany({
      where,
      include: {
        organization: { select: { name: true } },
        uploadedBy: { select: { email: true, displayName: true } },
      },
      orderBy: { uploadedAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ uploadJobs });
  } catch (error) {
    console.error("Get upload jobs error:", error);
    return NextResponse.json(
      { error: "Failed to fetch upload history" },
      { status: 500 }
    );
  }
}