import { type NextRequest, NextResponse } from "next/server";
import {
  createUser,
  findUserByEmail,
  bootstrapSystemOwner,
  createPendingAccessRequest,
  getUserAuthState,
} from "@/lib/auth";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { BRANDING } from "@/lib/branding";
import {
  checkRateLimit,
  getClientIp,
  RATE_LIMITS,
  rateLimitedResponse,
} from "@/lib/rate-limit";
import { isCaptchaConfigured, verifyCaptchaToken } from "@/lib/captcha";
import { getOrCreateRequestId, logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers);
  try {
    // Rate-limit: 10/min/IP. Keeps botnets from mass-creating accounts
    // even if CAPTCHA enforcement is temporarily misconfigured.
    const ip = getClientIp(request);
    const rl = await checkRateLimit({
      bucket: "register",
      key: ip,
      limit: RATE_LIMITS.register.limit,
      windowMs: RATE_LIMITS.register.windowMs,
    });
    if (!rl.success) return rateLimitedResponse(rl);

    const {
      email,
      password,
      displayName,
      organizationName,
      captchaToken,
    } = await request.json();

    // CAPTCHA (hCaptcha) — verified server-side when configured.
    // In development with no HCAPTCHA_SECRET, verifyCaptchaToken returns ok=true
    // and logs a one-time warning (see src/lib/captcha.ts).
    // In production without HCAPTCHA_SECRET, verification fails closed so we
    // never accept unprotected registrations.
    if (isCaptchaConfigured() || process.env.NODE_ENV === "production") {
      const verify = await verifyCaptchaToken(captchaToken, ip);
      if (!verify.ok) {
        if (verify.reason === "not-configured-production") {
          logger.error({
            event: "register.captcha_not_configured",
            msg: "HCAPTCHA_SECRET missing in production — registration refused",
            requestId,
          });
          return NextResponse.json(
            {
              error:
                "Registration is temporarily unavailable. Please contact support.",
            },
            { status: 500, headers: { "x-request-id": requestId } },
          );
        }
        return NextResponse.json(
          { error: "CAPTCHA verification failed. Please try again." },
          { status: 400 },
        );
      }
    }

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await findUserByEmail(normalizedEmail);
    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const user = await createUser(normalizedEmail, password, displayName);

    let redirectTo = "/pending-approval";
    let authState: "APPROVED" | "PENDING" | "NO_ACCESS" = "PENDING";
    let role = null;

    if (normalizedEmail === BRANDING.systemOwnerEmail.toLowerCase()) {
      const systemOwnerRole = await bootstrapSystemOwner(user.id, normalizedEmail);
      if (systemOwnerRole) {
        redirectTo = "/dashboard";
        authState = "APPROVED";
        role = { role: systemOwnerRole.role, organizationId: null };
      }
    } else {
      await createPendingAccessRequest(
        user.id,
        normalizedEmail,
        displayName,
        organizationName
      );
    }

    const token = await createSessionToken({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    });
    await setSessionCookie(token);

    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          organizationId: null,
          role,
          organization: null,
          authState,
        },
        redirectTo,
        message: "Registration successful",
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error({
      event: "register.unhandled_error",
      msg: "Register route threw an unhandled error",
      requestId,
      error,
    });
    return NextResponse.json(
      { error: "Registration failed. Please try again." },
      { status: 500, headers: { "x-request-id": requestId } },
    );
  }
}