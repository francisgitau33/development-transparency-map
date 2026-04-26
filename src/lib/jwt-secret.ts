/**
 * Shared JWT secret resolver.
 *
 * Requirements (see Prompt 5 · Part A):
 *   - In production, if JWT_SECRET is missing, throw a clear server-side
 *     configuration error. The app must NOT silently run with a hard-coded
 *     secret in production.
 *   - In development / test, allow a development fallback but emit a console
 *     warning exactly once so it is obvious locally without blocking work.
 *   - Middleware and session utilities must use the same resolution logic.
 *   - This module is edge-safe: no Node-only APIs are imported. Both the
 *     Next.js edge runtime (middleware) and the Node runtime (route
 *     handlers) can use it.
 *   - The secret must never be exposed to the client. Do NOT introduce a
 *     NEXT_PUBLIC_* variant.
 */

const DEV_FALLBACK_SECRET =
  "map-my-dev-data-secret-change-in-production-DO-NOT-USE-IN-PROD";

let warnedAboutFallback = false;

/**
 * Resolve the raw JWT secret string.
 * @throws Error in production when JWT_SECRET is unset or empty.
 */
export function getJwtSecretString(): string {
  const raw = process.env.JWT_SECRET;
  const trimmed = typeof raw === "string" ? raw.trim() : "";

  if (trimmed.length > 0) {
    return trimmed;
  }

  // Missing or empty secret.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[config] JWT_SECRET is required in production. Refusing to start with a hard-coded fallback secret. Set a strong, unique JWT_SECRET in the deployment environment.",
    );
  }

  if (!warnedAboutFallback) {
    warnedAboutFallback = true;
    console.warn(
      "[config] JWT_SECRET is not set. Using an insecure development fallback. This is ONLY acceptable for local development — set JWT_SECRET in .env before deploying.",
    );
  }
  return DEV_FALLBACK_SECRET;
}

/**
 * Resolve the JWT secret as the Uint8Array expected by `jose`.
 * Cached per-process after first successful resolution.
 */
let cachedBytes: Uint8Array | null = null;

export function getJwtSecretBytes(): Uint8Array {
  if (cachedBytes) return cachedBytes;
  cachedBytes = new TextEncoder().encode(getJwtSecretString());
  return cachedBytes;
}