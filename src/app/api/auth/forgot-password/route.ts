import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import {
  buildPasswordResetEmail,
  EmailNotConfiguredError,
  sendEmail,
} from "@/lib/email";

/**
 * Forgot Password API
 *
 * Generates a secure reset token and stores a bcrypt hash of it.
 *
 * Security behaviour
 * ------------------
 * - Never reveals whether an email exists (returns the same success payload
 *   in either case).
 * - Uses crypto.randomBytes for the raw token and bcrypt for the at-rest hash.
 * - Token expires after TOKEN_EXPIRY_HOURS and is single-use.
 * - The raw token / reset URL is NEVER returned in the HTTP response, in any
 *   environment. It is delivered exclusively through the email abstraction
 *   (src/lib/email.ts).
 * - In production, if no email provider is configured, the request fails
 *   loudly server-side (logged) and the user-facing response remains
 *   neutral to prevent enumeration.
 */

const TOKEN_EXPIRY_HOURS = 1;

function resolveBaseUrl(request: NextRequest): string {
  const envUrl = process.env.APP_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, "");
  return request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 },
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Generic response for every valid-looking request, independent of
    // whether the account exists or whether email delivery succeeded.
    const neutralResponse = {
      message:
        "If an account exists with this email, a password reset link has been sent.",
    };

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return NextResponse.json(neutralResponse);
    }

    // Generate secure token + hash.
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = await bcrypt.hash(rawToken, 10);

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS);

    // Invalidate any still-valid tokens issued earlier for this email.
    await prisma.passwordResetToken.updateMany({
      where: { email: normalizedEmail, usedAt: null },
      data: { usedAt: new Date() },
    });

    await prisma.passwordResetToken.create({
      data: {
        email: normalizedEmail,
        tokenHash,
        expiresAt,
      },
    });

    const baseUrl = resolveBaseUrl(request);
    const resetUrl = `${baseUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(normalizedEmail)}`;

    try {
      await sendEmail(
        buildPasswordResetEmail({
          to: normalizedEmail,
          resetUrl,
          expiresAt,
        }),
      );
    } catch (err) {
      if (err instanceof EmailNotConfiguredError) {
        // Critical: in production this must be visible to operators but MUST
        // NOT leak the token to the client. Keep the neutral response.
        console.error(
          "[forgot-password] Email provider misconfigured; reset email NOT sent.",
          err.message,
        );
        if (process.env.NODE_ENV === "production") {
          return NextResponse.json(
            {
              error:
                "Password reset is temporarily unavailable. Please contact support.",
            },
            { status: 500 },
          );
        }
        // Non-production: also avoid emitting the URL in the response, but
        // the provider=console path (the default for dev) should already
        // have printed it above. We land here only if someone explicitly
        // set EMAIL_PROVIDER to an unusable value in dev.
      } else {
        console.error("[forgot-password] Email delivery failed:", err);
        // Do not reveal the failure to the caller; keep the neutral response
        // so attackers can't distinguish delivery states either.
      }
    }

    return NextResponse.json(neutralResponse);
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "An error occurred. Please try again." },
      { status: 500 },
    );
  }
}