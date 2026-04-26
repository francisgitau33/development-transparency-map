import { type NextRequest, NextResponse } from "next/server";
import {
  authenticateUser,
  bootstrapSystemOwner,
  createPendingAccessRequest,
} from "@/lib/auth";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { BRANDING } from "@/lib/branding";
import {
  checkRateLimit,
  getClientIp,
  RATE_LIMITS,
  rateLimitedResponse,
} from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    // Server-side rate limit: 10 / min / IP. Neutral wording on 429 —
    // does not reveal whether an account exists.
    const rl = checkRateLimit({
      bucket: "login",
      key: getClientIp(request),
      limit: RATE_LIMITS.login.limit,
      windowMs: RATE_LIMITS.login.windowMs,
    });
    if (!rl.success) return rateLimitedResponse(rl);

    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const authResult = await authenticateUser(email, password);

    if (!authResult) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    let redirectTo = "/pending-approval";
    let authState: "APPROVED" | "PENDING" | "NO_ACCESS" = "NO_ACCESS";
    let role = authResult.role;

    if (authResult.role) {
      redirectTo = "/dashboard";
      authState = "APPROVED";
    } else if (
      authResult.email.toLowerCase() === BRANDING.systemOwnerEmail.toLowerCase()
    ) {
      const systemOwnerRole = await bootstrapSystemOwner(
        authResult.id,
        authResult.email
      );
      if (systemOwnerRole) {
        redirectTo = "/dashboard";
        authState = "APPROVED";
        role = systemOwnerRole;
      }
    } else if (authResult.pendingRequest) {
      authState = "PENDING";
      if (authResult.pendingRequest.status === "APPROVED") {
        redirectTo = "/dashboard";
        authState = "APPROVED";
      } else if (authResult.pendingRequest.status === "DECLINED") {
        return NextResponse.json(
          { error: "Your access request was declined" },
          { status: 403 }
        );
      }
    } else {
      await createPendingAccessRequest(
        authResult.id,
        authResult.email,
        authResult.displayName
      );
      authState = "PENDING";
    }

    const token = await createSessionToken({
      id: authResult.id,
      email: authResult.email,
      displayName: authResult.displayName,
    });
    await setSessionCookie(token);

    return NextResponse.json({
      user: {
        id: authResult.id,
        email: authResult.email,
        displayName: authResult.displayName,
        organizationId: authResult.organizationId,
        role: role
          ? { role: role.role, organizationId: role.organizationId }
          : null,
        organization: authResult.organization
          ? { id: authResult.organization.id, name: authResult.organization.name }
          : null,
        authState,
      },
      redirectTo,
      message: "Login successful",
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Login failed. Please try again." },
      { status: 500 }
    );
  }
}