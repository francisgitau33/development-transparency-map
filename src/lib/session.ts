import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { getJwtSecretBytes } from "./jwt-secret";

const SESSION_COOKIE_NAME = "mmdd-session";

interface SessionPayload {
  userId: string;
  email: string;
  displayName: string | null;
}

export async function createSessionToken(user: {
  id: string;
  email: string;
  displayName: string | null;
}) {
  return new SignJWT({
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecretBytes());
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, getJwtSecretBytes());
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      displayName: (payload.displayName as string) || null,
    };
  } catch {
    return null;
  }
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}