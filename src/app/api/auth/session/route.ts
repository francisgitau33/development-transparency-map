import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logger, newRequestId } from "@/lib/logger";

export async function GET() {
  const requestId = newRequestId();
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ user: null, authenticated: false });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        role: true,
        organization: true,
        pendingRequest: true,
      },
    });

    if (!user) {
      return NextResponse.json({ user: null, authenticated: false });
    }

    let authState: "APPROVED" | "PENDING" | "NO_ACCESS" = "NO_ACCESS";

    if (user.role) {
      authState = "APPROVED";
    } else if (user.pendingRequest) {
      if (user.pendingRequest.status === "APPROVED") {
        authState = "APPROVED";
      } else if (user.pendingRequest.status === "PENDING") {
        authState = "PENDING";
      }
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        organizationId: user.organizationId,
        role: user.role
          ? { role: user.role.role, organizationId: user.role.organizationId }
          : null,
        organization: user.organization
          ? { id: user.organization.id, name: user.organization.name }
          : null,
        authState,
      },
      authenticated: true,
    });
  } catch (error) {
    logger.error({
      event: "session.unhandled_error",
      msg: "Session route threw an unhandled error",
      requestId,
      error,
    });
    return NextResponse.json(
      { user: null, authenticated: false },
      { headers: { "x-request-id": requestId } },
    );
  }
}