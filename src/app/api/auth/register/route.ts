import { NextRequest, NextResponse } from "next/server";
import {
  createUser,
  findUserByEmail,
  bootstrapSystemOwner,
  createPendingAccessRequest,
  getUserAuthState,
} from "@/lib/auth";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { BRANDING } from "@/lib/branding";

export async function POST(request: NextRequest) {
  try {
    const { email, password, displayName, organizationName } = await request.json();

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
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Registration failed. Please try again." },
      { status: 500 }
    );
  }
}