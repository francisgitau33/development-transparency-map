import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { validateProject } from "@/lib/validation";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";

const VALID_VISIBILITIES = new Set([
  "DRAFT",
  "PENDING_REVIEW",
  "PUBLISHED",
  "UNPUBLISHED",
]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        organization: {
          select: { id: true, name: true, type: true },
        },
        createdBy: {
          select: { id: true, email: true, displayName: true },
        },
        administrativeArea: {
          select: { id: true, name: true, type: true, countryCode: true },
        },
        donor: {
          select: {
            id: true,
            name: true,
            donorType: true,
            countryOfOrigin: true,
            website: true,
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Public users may only read PUBLISHED projects.
    // Authenticated users can read projects per their role scope.
    if (project.visibility !== "PUBLISHED") {
      const session = await getSession();
      if (!session) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 404 },
        );
      }
      const viewer = await prisma.user.findUnique({
        where: { id: session.userId },
        include: { role: true },
      });
      const role = viewer?.role?.role;
      if (
        role !== "SYSTEM_OWNER" &&
        !(
          role === "PARTNER_ADMIN" &&
          viewer?.role?.organizationId === project.organizationId
        )
      ) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 404 },
        );
      }
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error("Get project error:", error);
    return NextResponse.json(
      { error: "Failed to fetch project" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { role: true },
    });

    if (!user?.role) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const existingProject = await prisma.project.findUnique({
      where: { id },
    });

    if (!existingProject) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (
      user.role.role === "PARTNER_ADMIN" &&
      existingProject.organizationId !== user.role.organizationId
    ) {
      return NextResponse.json(
        { error: "You can only edit projects in your organization" },
        { status: 403 },
      );
    }

    const data = await request.json();

    if (user.role.role === "PARTNER_ADMIN") {
      // Partner Admins may not reassign projects to another org, nor grant
      // themselves PUBLISHED visibility.
      data.organizationId = user.role.organizationId;
      if (
        typeof data.visibility === "string" &&
        data.visibility.toUpperCase() !== existingProject.visibility
      ) {
        // Allow a partner admin to drop from PENDING_REVIEW to DRAFT, but
        // never to PUBLISHED / UNPUBLISHED.
        const requested = data.visibility.toUpperCase();
        if (requested === "PUBLISHED" || requested === "UNPUBLISHED") {
          return NextResponse.json(
            {
              error:
                "Partner Admins cannot publish or unpublish projects. Submit for System Owner review instead.",
            },
            { status: 403 },
          );
        }
      }
    }

    // Re-validate active country / sector on every update — an admin may have
    // disabled the reference row after the project was first created.
    const countryCode: string | undefined = data.countryCode
      ? String(data.countryCode).toUpperCase()
      : undefined;
    const sectorKey: string | undefined = data.sectorKey
      ? String(data.sectorKey).toUpperCase()
      : undefined;

    if (countryCode) {
      const country = await prisma.referenceCountry.findUnique({
        where: { code: countryCode },
      });
      if (!country || !country.active) {
        return NextResponse.json(
          { error: "Invalid or inactive country code" },
          { status: 400 },
        );
      }
    }

    if (sectorKey) {
      const sector = await prisma.referenceSector.findUnique({
        where: { key: sectorKey },
      });
      if (!sector || !sector.active) {
        return NextResponse.json(
          { error: "Invalid or inactive sector" },
          { status: 400 },
        );
      }
    }

    // Validate district / county linkage against the (possibly updated)
    // country code. Accept `null` as "detach the admin area".
    if (data.administrativeAreaId) {
      const area = await prisma.administrativeArea.findUnique({
        where: { id: String(data.administrativeAreaId) },
      });
      if (!area) {
        return NextResponse.json(
          { error: "Selected district / county was not found" },
          { status: 400 },
        );
      }
      if (!area.active) {
        return NextResponse.json(
          { error: "Selected district / county is not active" },
          { status: 400 },
        );
      }
      const effectiveCountry = countryCode ?? existingProject.countryCode;
      if (area.countryCode !== effectiveCountry) {
        return NextResponse.json(
          {
            error:
              "Selected district / county does not belong to the selected country",
          },
          { status: 400 },
        );
      }
    }

    if (data.donorId) {
      const donor = await prisma.donor.findUnique({
        where: { id: String(data.donorId) },
      });
      if (!donor) {
        return NextResponse.json(
          { error: "Selected donor was not found" },
          { status: 400 },
        );
      }
      if (!donor.active) {
        return NextResponse.json(
          { error: "Selected donor is not active" },
          { status: 400 },
        );
      }
    }

    const validation = validateProject(data);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.errors },
        { status: 400 },
      );
    }

    // Resolve the final visibility value after RBAC rules.
    let nextVisibility: string = existingProject.visibility;
    if (typeof data.visibility === "string") {
      const requested = data.visibility.toUpperCase();
      if (VALID_VISIBILITIES.has(requested)) {
        if (user.role.role === "SYSTEM_OWNER") {
          nextVisibility = requested;
        } else if (
          user.role.role === "PARTNER_ADMIN" &&
          (requested === "DRAFT" || requested === "PENDING_REVIEW")
        ) {
          nextVisibility = requested;
        }
      }
    }

    const project = await prisma.project.update({
      where: { id },
      data: {
        ...validation.normalizedData,
        visibility: nextVisibility,
        startDate: new Date(validation.normalizedData?.startDate as string),
        endDate: validation.normalizedData?.endDate
          ? new Date(validation.normalizedData?.endDate as string)
          : null,
      } as never,
      include: {
        organization: {
          select: { id: true, name: true, type: true },
        },
        administrativeArea: {
          select: { id: true, name: true, type: true, countryCode: true },
        },
        donor: {
          select: { id: true, name: true, donorType: true },
        },
      },
    });

    await logAudit({
      actorId: session.userId,
      actorEmail: user.email,
      action: AUDIT_ACTIONS.PROJECT_UPDATED,
      entityType: "Project",
      entityId: project.id,
      payload: {
        title: project.title,
        status: project.status,
        visibility: project.visibility,
        previousVisibility: existingProject.visibility,
      },
    });

    if (nextVisibility !== existingProject.visibility) {
      await logAudit({
        actorId: session.userId,
        actorEmail: user.email,
        action: AUDIT_ACTIONS.PROJECT_VISIBILITY_CHANGED,
        entityType: "Project",
        entityId: project.id,
        payload: {
          from: existingProject.visibility,
          to: nextVisibility,
        },
      });
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error("Update project error:", error);
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { role: true },
    });

    if (!user?.role) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const existingProject = await prisma.project.findUnique({
      where: { id },
    });

    if (!existingProject) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (
      user.role.role === "PARTNER_ADMIN" &&
      existingProject.organizationId !== user.role.organizationId
    ) {
      return NextResponse.json(
        { error: "You can only delete projects in your organization" },
        { status: 403 },
      );
    }

    await prisma.project.delete({
      where: { id },
    });

    await logAudit({
      actorId: session.userId,
      actorEmail: user.email,
      action: AUDIT_ACTIONS.PROJECT_DELETED,
      entityType: "Project",
      entityId: id,
      payload: {
        title: existingProject.title,
        organizationId: existingProject.organizationId,
      },
    });

    return NextResponse.json({ message: "Project deleted successfully" });
  } catch (error) {
    console.error("Delete project error:", error);
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 },
    );
  }
}