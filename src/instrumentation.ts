/**
 * Next.js instrumentation hook
 * (https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation).
 *
 * Runs once per runtime (nodejs / edge) at boot. We use it to initialise
 * Sentry for error tracking in production.
 *
 * Sentry is ONLY activated when `SENTRY_DSN` is set. Without a DSN the
 * `Sentry.init` call is skipped and the SDK stays dormant, so dev,
 * test, and preview environments keep their current behaviour.
 */
import type { Instrumentation } from "next";

export async function register(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      // Traces are off by default; enable via SENTRY_TRACES_SAMPLE_RATE
      // when there is budget for it.
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
      // Belt-and-braces redaction. The structured logger already
      // redacts these, but Sentry also captures automatic breadcrumbs
      // + request context.
      beforeSend(event) {
        if (event.request) {
          event.request.cookies = undefined;
          if (event.request.headers) {
            for (const h of [
              "authorization",
              "cookie",
              "x-api-key",
              "x-auth-token",
            ]) {
              if (event.request.headers[h]) {
                event.request.headers[h] = "[REDACTED]";
              }
            }
          }
          if (event.request.data) {
            event.request.data = "[REDACTED]";
          }
        }
        return event;
      },
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    });
  }
}

/**
 * Called by Next.js for unhandled errors in server components / route
 * handlers. We forward through Sentry so the DSN stays optional — if
 * the DSN is unset the call is a no-op.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(err, request, context);
};