"use client";

import { useEffect, useRef } from "react";

/**
 * Lightweight hCaptcha widget.
 *
 * Why we hand-roll this instead of pulling @hcaptcha/react-hcaptcha:
 *   - We want zero new npm dependencies for this hardening prompt.
 *   - hCaptcha exposes a stable global `hcaptcha` API + data-attribute render,
 *     which is all we need for a single form instance on /login.
 *
 * Behaviour:
 *   - Only renders when NEXT_PUBLIC_HCAPTCHA_SITE_KEY is configured. If it
 *     is not set, renders nothing AND notifies the parent that it is
 *     disabled so registration can proceed in development without CAPTCHA.
 *     The server still refuses unprotected registrations in production
 *     (see src/lib/captcha.ts and src/app/api/auth/register/route.ts).
 *   - Calls `onVerify(token)` when the user completes the challenge.
 *   - Calls `onExpire()` / `onError()` so the parent can clear its token.
 *
 * The component is client-only because hCaptcha mutates the DOM.
 */

interface HCaptchaGlobal {
  render: (
    container: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ) => string | number;
  reset: (widgetId?: string | number) => void;
  remove: (widgetId?: string | number) => void;
}

declare global {
  interface Window {
    hcaptcha?: HCaptchaGlobal;
    __mmdd_hcaptcha_loading?: boolean;
  }
}

const HCAPTCHA_SCRIPT_SRC =
  "https://js.hcaptcha.com/1/api.js?render=explicit";

function loadHCaptchaScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.hcaptcha) return Promise.resolve();
  if (window.__mmdd_hcaptcha_loading) {
    return new Promise((resolve) => {
      const check = () => {
        if (window.hcaptcha) resolve();
        else setTimeout(check, 50);
      };
      check();
    });
  }
  window.__mmdd_hcaptcha_loading = true;
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${HCAPTCHA_SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("hCaptcha script failed to load")),
      );
      return;
    }
    const script = document.createElement("script");
    script.src = HCAPTCHA_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("hCaptcha script failed to load"));
    document.head.appendChild(script);
  });
}

export interface HCaptchaWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  /**
   * Fires on mount with `true` when CAPTCHA is enabled (site key present) and
   * `false` when it is not. Parents use this to decide whether to require a
   * token before submitting the form.
   */
  onAvailability?: (enabled: boolean) => void;
  /** Optional explicit site key, primarily for testing. */
  siteKey?: string;
}

export function HCaptchaWidget({
  onVerify,
  onExpire,
  onError,
  onAvailability,
  siteKey,
}: HCaptchaWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | number | null>(null);

  const effectiveSiteKey =
    siteKey ?? process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY ?? "";

  // One-shot availability notification.
  const availabilityNotifiedRef = useRef(false);
  useEffect(() => {
    if (availabilityNotifiedRef.current) return;
    availabilityNotifiedRef.current = true;
    onAvailability?.(effectiveSiteKey.trim().length > 0);
  }, [effectiveSiteKey, onAvailability]);

  useEffect(() => {
    if (!effectiveSiteKey.trim()) return;
    let cancelled = false;

    loadHCaptchaScript()
      .then(() => {
        if (cancelled) return;
        if (!containerRef.current || !window.hcaptcha) return;
        // Prevent double render (StrictMode etc.).
        if (widgetIdRef.current !== null) return;
        widgetIdRef.current = window.hcaptcha.render(containerRef.current, {
          sitekey: effectiveSiteKey,
          callback: (token) => onVerify(token),
          "expired-callback": () => onExpire?.(),
          "error-callback": () => onError?.(),
        });
      })
      .catch((err) => {
        console.error("[hcaptcha]", err);
        onError?.();
      });

    return () => {
      cancelled = true;
      if (
        widgetIdRef.current !== null &&
        typeof window !== "undefined" &&
        window.hcaptcha
      ) {
        try {
          window.hcaptcha.remove(widgetIdRef.current);
        } catch {
          // ignore — remove can throw if the widget already torn down
        }
        widgetIdRef.current = null;
      }
    };
  }, [effectiveSiteKey, onVerify, onExpire, onError]);

  if (!effectiveSiteKey.trim()) {
    // Render nothing when CAPTCHA is not configured. Dev-only path.
    return null;
  }

  return (
    <div
      data-design-id="register-captcha"
      ref={containerRef}
      className="flex justify-center"
    />
  );
}