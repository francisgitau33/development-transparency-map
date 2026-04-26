/**
 * hCaptcha server-side verification helper.
 *
 * Design (see Prompt 5 · Part C):
 *   - If HCAPTCHA_SECRET is NOT configured:
 *       - In production, registration must fail safely. Callers should check
 *         `isCaptchaConfigured()` and return a clear 500 configuration error
 *         so that an unprotected registration form is never served in prod.
 *       - In development, registration continues without CAPTCHA. A warning
 *         is logged exactly once per process so local work is not blocked.
 *   - If HCAPTCHA_SECRET is configured, the token from the client is POSTed
 *     to hCaptcha's verify endpoint. The token must be both present and
 *     valid or `verifyCaptchaToken` returns `false`.
 *
 * This module is used by src/app/api/auth/register/route.ts only. It is
 * deliberately small and has no side effects beyond the network verify
 * call and the one-time console warning.
 */

const HCAPTCHA_VERIFY_URL = "https://hcaptcha.com/siteverify";

let warnedNoSecret = false;

/**
 * Is hCaptcha configured server-side?
 * The client site key (NEXT_PUBLIC_HCAPTCHA_SITE_KEY) is irrelevant for
 * server enforcement — only HCAPTCHA_SECRET matters here.
 */
export function isCaptchaConfigured(): boolean {
  return typeof process.env.HCAPTCHA_SECRET === "string"
    && process.env.HCAPTCHA_SECRET.trim().length > 0;
}

export interface CaptchaVerifyResult {
  /** True only when verification succeeded OR CAPTCHA is intentionally disabled in dev. */
  ok: boolean;
  /** Reason set when ok=false. Safe to log; not user-facing. */
  reason?:
    | "missing-token"
    | "verification-failed"
    | "not-configured-production";
  /** Raw error codes from hCaptcha if the verify call was made. */
  errorCodes?: string[];
}

/**
 * Verify the hCaptcha response token the client submitted.
 *
 * `token` is typically passed in the request body as `captchaToken`.
 * `remoteIp` is optional — hCaptcha accepts it but does not require it.
 */
export async function verifyCaptchaToken(
  token: string | undefined | null,
  remoteIp?: string,
): Promise<CaptchaVerifyResult> {
  const secret = process.env.HCAPTCHA_SECRET?.trim();

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      // In production we must not silently accept. The route should refuse
      // to process the registration.
      return { ok: false, reason: "not-configured-production" };
    }
    if (!warnedNoSecret) {
      warnedNoSecret = true;
      console.warn(
        "[captcha] HCAPTCHA_SECRET not set. Registration CAPTCHA is DISABLED for development. Set HCAPTCHA_SECRET + NEXT_PUBLIC_HCAPTCHA_SITE_KEY in production.",
      );
    }
    return { ok: true };
  }

  if (!token || typeof token !== "string" || token.trim().length === 0) {
    return { ok: false, reason: "missing-token" };
  }

  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token.trim());
    if (remoteIp) body.set("remoteip", remoteIp);

    const res = await fetch(HCAPTCHA_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
      // The hCaptcha verify endpoint should respond quickly; fail closed on slow responses.
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) {
      return {
        ok: false,
        reason: "verification-failed",
        errorCodes: [`http_${res.status}`],
      };
    }
    const data = (await res.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };

    if (data.success === true) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: "verification-failed",
      errorCodes: data["error-codes"] ?? [],
    };
  } catch (err) {
    console.error("[captcha] hCaptcha verify call failed:", err);
    return { ok: false, reason: "verification-failed" };
  }
}