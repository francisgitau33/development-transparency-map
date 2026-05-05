import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import { getOrCreateRequestId, logger } from "@/lib/logger";

/**
 * Reset Password API
 * 
 * Verifies the reset token and updates the user's password.
 * 
 * Security considerations:
 * - Validates token against hashed version in database
 * - Checks token expiry
 * - Prevents token reuse
 * - Hashes new password before storage
 */

export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers);
  try {
    const { email, token, password } = await request.json();

    // Validate inputs
    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Reset token is required" },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find valid reset tokens for this email (not expired, not used)
    const resetTokens = await prisma.passwordResetToken.findMany({
      where: {
        email: normalizedEmail,
        usedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (resetTokens.length === 0) {
      return NextResponse.json(
        { error: "Invalid or expired reset link. Please request a new one." },
        { status: 400 }
      );
    }

    // Find matching token
    let validToken = null;
    for (const resetToken of resetTokens) {
      const isMatch = await bcrypt.compare(token, resetToken.tokenHash);
      if (isMatch) {
        validToken = resetToken;
        break;
      }
    }

    if (!validToken) {
      return NextResponse.json(
        { error: "Invalid or expired reset link. Please request a new one." },
        { status: 400 }
      );
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid or expired reset link. Please request a new one." },
        { status: 400 }
      );
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update password and mark token as used in a transaction
    await prisma.$transaction([
      // Update user password
      prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      }),
      // Mark token as used
      prisma.passwordResetToken.update({
        where: { id: validToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // Emit a non-PII structured event. We intentionally DO NOT log the user's
    // email, the reset token, the reset URL, the new password, cookies, or
    // authorization headers here. Only the opaque database user id is
    // included so SYSTEM_OWNER operators can correlate with the audit log if
    // required.
    logger.info({
      event: "reset_password.succeeded",
      msg: "Password reset succeeded",
      requestId,
      ctx: { userId: user.id },
    });

    return NextResponse.json({
      message: "Password has been reset successfully. You can now log in with your new password.",
    });
  } catch (error) {
    logger.error({
      event: "reset_password.unhandled_error",
      msg: "Reset-password route threw an unhandled error",
      requestId,
      error,
    });
    return NextResponse.json(
      { error: "An error occurred. Please try again." },
      { status: 500, headers: { "x-request-id": requestId } },
    );
  }
}

/**
 * Validate token without resetting password
 * Used by the reset password page to check if token is still valid
 */
export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers);
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    const token = searchParams.get("token");

    if (!email || !token) {
      return NextResponse.json(
        { valid: false, error: "Missing email or token" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find valid reset tokens for this email
    const resetTokens = await prisma.passwordResetToken.findMany({
      where: {
        email: normalizedEmail,
        usedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (resetTokens.length === 0) {
      return NextResponse.json({ valid: false, error: "Token expired or already used" });
    }

    // Check if any token matches
    for (const resetToken of resetTokens) {
      const isMatch = await bcrypt.compare(token, resetToken.tokenHash);
      if (isMatch) {
        return NextResponse.json({ valid: true });
      }
    }

    return NextResponse.json({ valid: false, error: "Invalid token" });
  } catch (error) {
    logger.error({
      event: "reset_password.validate_token_failed",
      msg: "Reset-password validate-token route threw an unhandled error",
      requestId,
      error,
    });
    return NextResponse.json(
      { valid: false, error: "An error occurred" },
      { status: 500, headers: { "x-request-id": requestId } },
    );
  }
}