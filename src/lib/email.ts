/**
 * Email delivery abstraction.
 *
 * Selection rules
 * ---------------
 * - EMAIL_PROVIDER=console  → log the message to the server console. Allowed
 *                             in all environments, but production callers
 *                             SHOULD use a real provider.
 * - EMAIL_PROVIDER=resend   → call the Resend HTTP API. Requires
 *                             RESEND_API_KEY and EMAIL_FROM.
 * - EMAIL_PROVIDER=smtp     → reserved for a future SMTP transport. Calling
 *                             this in production without SMTP env vars will
 *                             throw EmailNotConfiguredError.
 *
 * Default resolution
 * ------------------
 * - If EMAIL_PROVIDER is unset:
 *     * In non-production: behave as "console".
 *     * In production:     throw EmailNotConfiguredError — the caller must
 *                          NOT leak the reset token / link in the HTTP
 *                          response when this happens.
 *
 * Secrets are never logged. Reset URLs are never returned to the HTTP client
 * from the API; they are only delivered through this module.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export class EmailNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailNotConfiguredError";
  }
}

function resolveProvider(): string {
  const configured = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? "unconfigured" : "console";
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const provider = resolveProvider();

  if (provider === "console") {
    // Development-only fallback. Never reached in production unless the
    // operator has explicitly set EMAIL_PROVIDER=console.
    /* eslint-disable no-console */
    console.log("\n========================================");
    console.log("[email:console] Outgoing email (dev only)");
    console.log("To:      ", input.to);
    console.log("Subject: ", input.subject);
    console.log(`Body:\n${input.text}`);
    console.log("========================================\n");
    /* eslint-enable no-console */
    return;
  }

  if (provider === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) {
      throw new EmailNotConfiguredError(
        "EMAIL_PROVIDER=resend requires RESEND_API_KEY and EMAIL_FROM",
      );
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html ?? input.text.replace(/\n/g, "<br/>"),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Resend send failed (${res.status}): ${detail.slice(0, 500)}`,
      );
    }
    return;
  }

  // "smtp" placeholder — intentionally not implemented; fail loudly.
  if (provider === "smtp") {
    throw new EmailNotConfiguredError(
      "EMAIL_PROVIDER=smtp is not implemented yet. Set EMAIL_PROVIDER=resend or contact ops.",
    );
  }

  // No provider configured in production.
  throw new EmailNotConfiguredError(
    "No email provider configured. Set EMAIL_PROVIDER and associated API keys (e.g. EMAIL_PROVIDER=resend, RESEND_API_KEY, EMAIL_FROM).",
  );
}

export function buildPasswordResetEmail(params: {
  to: string;
  resetUrl: string;
  expiresAt: Date;
}): SendEmailInput {
  const { to, resetUrl, expiresAt } = params;
  const expiresAtIso = expiresAt.toISOString();
  const text = [
    "We received a request to reset the password for your Development Transparency Map account.",
    "",
    `Reset your password here: ${resetUrl}`,
    "",
    `This link will expire at ${expiresAtIso}.`,
    "If you did not request a reset, you can safely ignore this email.",
  ].join("\n");
  return {
    to,
    subject: "Reset your Development Transparency Map password",
    text,
  };
}