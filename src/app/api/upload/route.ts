import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { validateProject, normalizeCoordinate, normalizeDate } from "@/lib/validation";

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

    const { rows, organizationId: reqOrgId } = await request.json();

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

    const [countries, sectors, organization] = await Promise.all([
      prisma.referenceCountry.findMany({ where: { active: true } }),
      prisma.referenceSector.findMany({ where: { active: true } }),
      prisma.organization.findUnique({ where: { id: organizationId } }),
    ]);

    if (!organization) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 400 }
      );
    }

    const countrySet = new Set(countries.map((c) => c.code));
    const sectorSet = new Set(sectors.map((s) => s.key));

    const validRows: unknown[] = [];
    const errorRows: RowError[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as CSVRow;
      const rowNum = i + 2;
      const errors: string[] = [];

      const countryCode = row.countryCode?.toUpperCase().trim();
      const sectorKey = row.sectorKey?.toUpperCase().trim();

      if (countryCode && !countrySet.has(countryCode)) {
        errors.push(`Invalid country code: ${countryCode}`);
      }

      if (sectorKey && !sectorSet.has(sectorKey)) {
        errors.push(`Invalid sector: ${sectorKey}`);
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
        validRows.push({
          ...validation.normalizedData,
          organizationId,
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
        errorReport: errorRows.length > 0 ? errorRows : null,
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