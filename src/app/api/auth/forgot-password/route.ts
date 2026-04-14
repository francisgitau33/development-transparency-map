import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import bcrypt from "bcrypt";

/**
 * Forgot Password API
 * 
 * Generates a secure reset token and stores the hashed version.
 * Returns the token for delivery (in production, this would be sent via email).
 * 
 * Security considerations:
 * - Does not reveal whether email exists in system
 * - Uses crypto.randomBytes for secure token generation
 * - Stores hashed token in database
 * - Token expires after 1 hour
 */

const TOKEN_EXPIRY_HOURS = 1;

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Always respond with success message to prevent email enumeration
    const successResponse = {
      message: "If an account exists with this email, a password reset link has been sent.",
    };

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // Don't reveal that user doesn't exist
      return NextResponse.json(successResponse);
    }

    // Generate secure token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = await bcrypt.hash(rawToken, 10);

    // Calculate expiry
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS);

    // Invalidate any existing unused tokens for this email
    await prisma.passwordResetToken.updateMany({
      where: {
        email: normalizedEmail,
        usedAt: null,
      },
      data: {
        usedAt: new Date(), // Mark as used to invalidate
      },
    });

    // Create new token
    await prisma.passwordResetToken.create({
      data: {
        email: normalizedEmail,
        tokenHash,
        expiresAt,
      },
    });

    // In production, send email here with reset link
    // For now, log the token for development/testing
    const resetUrl = `/reset-password?token=${rawToken}&email=${encodeURIComponent(normalizedEmail)}`;
    
    console.log(`\n========================================`);
    console.log(`PASSWORD RESET TOKEN GENERATED`);
    console.log(`Email: ${normalizedEmail}`);
    console.log(`Reset URL: ${resetUrl}`);
    console.log(`Expires: ${expiresAt.toISOString()}`);
    console.log(`========================================\n`);

    // Return success with reset info for development
    // In production, remove resetUrl from response
    return NextResponse.json({
      ...successResponse,
      // Development only - remove in production with real email service
      _dev: {
        resetUrl,
        expiresAt: expiresAt.toISOString(),
        note: "This token is shown for development. In production, it would be sent via email.",
      },
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "An error occurred. Please try again." },
      { status: 500 }
    );
  }
}