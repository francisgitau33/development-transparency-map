/**
 * Structured logger (Sprint 1 hardening).
 *
 * Goals
 * -----
 *   - Replace ad-hoc `console.error("Login error:", err)` patterns with a
 *     consistent JSON log line that carries a severity, an event name, a
 *     request id, and a redacted payload.
 *   - Forward errors to Sentry when `@sentry/nextjs` is installed and
 *     `SENTRY_DSN` is set. Silent no-op otherwise — the logger works
 *     whether Sentry is wired up or not.
 *   - Redact secret / PII fields before anything is emitted. The
 *     platform handles KDPA-relevant data and a leaked password or
 *     reset token in the log stream is a security incident.
 *
 * Output
 * ------
 *   Every line is a single-line JSON object:
 *     {
 *       "level": "info" | "warn" | "error",
 *       "event": "login.failed",
 *       "requestId": "…uuid…",
 *       "ts": "2025-…Z",
 *       "msg": "short human summary",
 *       "ctx": { …redacted context… }
 *     }
 *
 * What is redacted
 * ----------------
 *   Any object key that matches one of the following (case-insensitive)
 *   is replaced with the literal string "[REDACTED]":
 *     password, passwd, currentPassword, newPassword, token, resetToken,
 *     authorization, cookie, captchaToken, secret, apiKey, api_key,
 *     jwtSecret, hcaptchaSecret, resetLink, resetUrl, stripeSecretKey,
 *     upstashRedisRestToken
 *
 *   Additionally, any raw `request.body` payload MUST NOT be passed in.
 *   Callers should pick out the fields they need and pass them
 *   explicitly (e.g. `{ email }` — NEVER `{ ...body }`). The logger will
 *   also refuse to serialise anything under keys named `body`,
 *   `requestBody`, or `rawBody`.
 */

export type LogLevel = "info" | "warn" | "error";

export interface LogContext {
  [key: string]: unknown;
}

export interface LogFields {
  /** Short machine-readable event name, e.g. "login.failed". */
  event: string;
  /** One-line human summary. Optional. */
  msg?: string;
  /** Request id for correlation. Optional. */
  requestId?: string;
  /** Arbitrary additional context. Will be redacted. */
  ctx?: LogContext;
  /** Error object, if any. Its message + stack will be included. */
  error?: unknown;
}

/* ------------------------------------------------------------------ */
/* Redaction                                                           */
/* ------------------------------------------------------------------ */

const SECRET_KEY_PATTERNS = [
  /^password$/i,
  /^passwd$/i,
  /password$/i, // currentPassword, newPassword, etc.
  /^token$/i,
  /token$/i, // resetToken, captchaToken, sessionToken
  /^secret$/i,
  /secret$/i, // jwtSecret, hcaptchaSecret, stripeSecret
  /^authorization$/i,
  /^cookie$/i,
  /^apikey$/i,
  /^api_key$/i,
  /key$/i, // stripeSecretKey, upstashRestToken (covers *Key / *key)
  /^resetlink$/i,
  /^reseturl$/i,
];

const RAW_BODY_KEYS = new Set(["body", "requestbody", "rawbody"]);

const REDACTED = "[REDACTED]";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    (Object.getPrototypeOf(v) === Object.prototype ||
      Object.getPrototypeOf(v) === null)
  );
}

function keyIsSecret(key: string): boolean {
  for (const re of SECRET_KEY_PATTERNS) {
    if (re.test(key)) return true;
  }
  return false;
}

/**
 * Deep-redact an arbitrary value. Recurses into plain objects + arrays.
 * Handles circular references gracefully.
 */
export function redact(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (seen.has(value as object)) return "[Circular]";
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((v) => redact(v, seen));
  }

  if (!isPlainObject(value)) {
    // Do not try to walk Date, Error, Buffer, class instances, etc.
    // Serialize a safe summary instead.
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Error) {
      return { name: value.name, message: value.message, stack: value.stack };
    }
    return "[Unserialisable]";
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    const keyLc = k.toLowerCase();
    if (RAW_BODY_KEYS.has(keyLc)) {
      out[k] = REDACTED;
      continue;
    }
    if (keyIsSecret(k)) {
      out[k] = REDACTED;
      continue;
    }
    out[k] = redact(v, seen);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Sentry bridge (optional)                                            */
/* ------------------------------------------------------------------ */

type SentryModule = {
  captureException: (err: unknown, hint?: unknown) => void;
  captureMessage: (msg: string, hint?: unknown) => void;
};

let sentry: SentryModule | null = null;
let sentryResolved = false;

/**
 * Best-effort lazy import of `@sentry/nextjs`. Returns null if the
 * package is not installed OR if the DSN is not configured. Cached
 * after first call so we don't repeat the import cost on every log.
 */
async function resolveSentry(): Promise<SentryModule | null> {
  if (sentryResolved) return sentry;
  sentryResolved = true;

  if (!process.env.SENTRY_DSN) return null;

  try {
    // Use a dynamic import so the build does not hard-require @sentry/nextjs.
    // If the package is not installed, this throws and we silently skip.
    const mod = (await import(
      /* webpackIgnore: true */ "@sentry/nextjs"
    ).catch(() => null)) as SentryModule | null;
    sentry = mod;
  } catch {
    sentry = null;
  }
  return sentry;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

function emit(level: LogLevel, fields: LogFields) {
  const line: Record<string, unknown> = {
    level,
    ts: new Date().toISOString(),
    event: fields.event,
  };
  if (fields.msg) line.msg = fields.msg;
  if (fields.requestId) line.requestId = fields.requestId;
  if (fields.ctx) line.ctx = redact(fields.ctx);
  if (fields.error !== undefined) {
    line.error = redact(fields.error);
  }

  const serialized = safeStringify(line);

  const writer =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;
  writer(serialized);

  // Fire-and-forget Sentry forwarding. We explicitly do NOT await this
  // — log calls must not block request handling.
  if (level === "error") {
    void resolveSentry().then((s) => {
      if (!s) return;
      if (fields.error !== undefined) {
        s.captureException(fields.error, {
          contexts: { log: { event: fields.event, requestId: fields.requestId } },
        });
      } else {
        s.captureMessage(`${fields.event}${fields.msg ? `: ${fields.msg}` : ""}`);
      }
    });
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ level: "error", event: "logger.stringify_failed" });
  }
}

export const logger = {
  info(fields: LogFields) {
    emit("info", fields);
  },
  warn(fields: LogFields) {
    emit("warn", fields);
  },
  error(fields: LogFields) {
    emit("error", fields);
  },
};

/* ------------------------------------------------------------------ */
/* Request-id helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Generate a request id. Prefers the runtime's crypto.randomUUID() when
 * available (Node 19+, modern browsers, edge runtime). Falls back to a
 * best-effort string otherwise — the id only needs to be unique enough
 * for log correlation.
 */
export function newRequestId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Extract an inbound request id from headers, or generate a new one.
 * We accept both `x-request-id` (common) and `x-vercel-id` (set by the
 * Vercel edge network) so multi-hop traces stitch together.
 */
export function getOrCreateRequestId(headers: Headers | Record<string, string | undefined>): string {
  const get = (name: string): string | undefined => {
    if (typeof (headers as Headers).get === "function") {
      return (headers as Headers).get(name) ?? undefined;
    }
    const rec = headers as Record<string, string | undefined>;
    return rec[name] ?? rec[name.toLowerCase()];
  };
  return get("x-request-id") || get("x-vercel-id") || newRequestId();
}

/**
 * Test-only reset of the Sentry resolver cache. Vitest imports share
 * module state across files so we expose this to guarantee hermetic
 * behaviour in the logger tests.
 */
export function __resetLoggerForTests() {
  sentry = null;
  sentryResolved = false;
}