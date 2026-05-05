/** @type {import('next').NextConfig} */

/**
 * Content Security Policy (production).
 *
 * This policy is deliberately narrow. Every directive below is motivated by
 * concrete app behaviour; if a future feature needs a wider rule, document
 * the reason here before loosening it.
 *
 * Directives & rationale
 *   default-src 'self'
 *       Deny-by-default for every fetch type not explicitly listed.
 *
 *   script-src 'self' 'unsafe-inline' 'unsafe-eval' https://hcaptcha.com https://*.hcaptcha.com
 *       - 'self': all first-party JS bundles.
 *       - 'unsafe-inline' + 'unsafe-eval': REQUIRED for Next.js 15 App
 *         Router. Next injects small inline bootstraps and Turbopack can
 *         emit eval() shims. The Next.js docs and community recommend
 *         either nonce-based CSP (requires per-request SSR middleware
 *         wiring, deferred) or keeping these. We keep them for MVP and
 *         track "nonce-based CSP" as a follow-up.
 *       - hcaptcha.com / *.hcaptcha.com: hCaptcha challenge iframe loads
 *         its own JS. Required by the registration flow.
 *
 *   style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com
 *       - 'unsafe-inline': Tailwind's runtime + Next.js inject inline
 *         <style> blocks. shadcn/ui primitives also set inline styles via
 *         Radix.
 *       - fonts.googleapis.com: next/font sometimes references Google
 *         Fonts stylesheet URLs.
 *       - unpkg.com: Leaflet's bundled CSS is loaded from unpkg in the
 *         public map component.
 *
 *   img-src 'self' data: blob: https:
 *       - data: is used by Leaflet marker icons and some inline SVG.
 *       - blob: is used for team-photo upload preview.
 *       - https: is broad here on purpose — user-curated content
 *         (Organization logos, team photos, CMS home/about images,
 *         Unsplash map imagery) comes from arbitrary third-party
 *         hosts. We scope this only to images; other resource types
 *         stay locked down.
 *
 *   font-src 'self' data: https://fonts.gstatic.com
 *       Covers next/font CSS fonts + Leaflet's embedded data URIs.
 *
 *   connect-src 'self' https://*.sentry.io https://hcaptcha.com https://*.hcaptcha.com
 *       - *.sentry.io: error reporting when SENTRY_DSN is set.
 *         No-op if Sentry is not configured.
 *       - hcaptcha.com: challenge verification XHR.
 *
 *   frame-src https://hcaptcha.com https://*.hcaptcha.com
 *       The hCaptcha widget renders in a cross-origin iframe.
 *
 *   frame-ancestors 'none'
 *       Disallow framing of our pages (defense-in-depth with
 *       X-Frame-Options: DENY).
 *
 *   object-src 'none'
 *       Block legacy plugins.
 *
 *   base-uri 'self'
 *       Prevent injected <base> tags from redirecting relative URLs.
 *
 *   form-action 'self'
 *       All form posts go back to our own origin.
 *
 *   upgrade-insecure-requests
 *       Any accidental http:// sub-resource is auto-upgraded to https://.
 *
 * Exceptions (documented):
 *   1. 'unsafe-inline' / 'unsafe-eval' on script-src — Next.js 15 App
 *      Router requirement; tracked as follow-up "Nonce-based CSP".
 *   2. 'unsafe-inline' on style-src — Radix/shadcn + Tailwind injection.
 *   3. img-src https: — arbitrary user-supplied image hosts.
 */
const productionCSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://hcaptcha.com https://*.hcaptcha.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.sentry.io https://*.ingest.sentry.io https://hcaptcha.com https://*.hcaptcha.com",
  "frame-src https://hcaptcha.com https://*.hcaptcha.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

/**
 * Development CSP is deliberately loose so the Next.js dev server
 * (Turbopack HMR, websocket, eval'd bundles) and Design Mode proxy tools
 * keep working. These rules are NEVER applied in production.
 */
const developmentCSP = [
  "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: ws: wss: http: https:",
  "img-src 'self' data: blob: http: https:",
  "connect-src 'self' ws: wss: http: https:",
  "frame-ancestors 'self' http: https:",
].join("; ");

const securityHeaders = (isProd) => [
  {
    key: "Content-Security-Policy",
    value: isProd ? productionCSP : developmentCSP,
  },
  // 2-year HSTS with subdomains + preload. Only meaningful when the app
  // is actually served over HTTPS in production; browsers ignore this
  // header over plain HTTP.
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable every powerful feature we do not use. Geolocation is
  // explicitly NOT granted — the public map uses static coordinates.
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "autoplay=()",
      "camera=()",
      "display-capture=()",
      "fullscreen=(self)",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "midi=()",
      "payment=()",
      "picture-in-picture=()",
      "publickey-credentials-get=()",
      "screen-wake-lock=()",
      "sync-xhr=()",
      "usb=()",
      "xr-spatial-tracking=()",
    ].join(", "),
  },
];

const nextConfig = {
  // Vercel-compatible standalone output. Kept for parity with existing
  // deploys; `output: 'standalone'` is harmless on Vercel and lets us
  // also run in a generic Node container if required.
  output: "standalone",
  distDir:
    process.env.NODE_ENV === "production"
      ? process.env.BUILD_DIR || ".next-build"
      : ".next",

  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    const isDev = process.env.NODE_ENV === "development";

    // Dev-only permissive CORS for Design Mode tooling. Never emitted in
    // production.
    const devCorsHeaders = isDev
      ? [
          {
            source: "/:path*",
            headers: [
              { key: "Access-Control-Allow-Origin", value: "*" },
              {
                key: "Access-Control-Allow-Methods",
                value: "GET, POST, PUT, DELETE, OPTIONS",
              },
              { key: "Access-Control-Allow-Headers", value: "*" },
            ],
          },
        ]
      : [];

    return [
      ...devCorsHeaders,
      {
        // Apply security headers to every route.
        source: "/:path*",
        headers: securityHeaders(isProd),
      },
    ];
  },

  images: {
    unoptimized: true,
    domains: [
      "source.unsplash.com",
      "images.unsplash.com",
      "ext.same-assets.com",
      "ugc.same-assets.com",
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "source.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "ext.same-assets.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "ugc.same-assets.com",
        pathname: "/**",
      },
    ],
  },

  // Build-time quality gates are enforced. Do NOT re-enable these bypasses
  // without explicit sign-off from the engineering lead — letting a bad
  // type or lint error reach production was flagged as a release blocker
  // in the Sprint 1 Systems Engineering Review.
  //
  // typescript.ignoreBuildErrors: intentionally omitted (default = false)
  // eslint.ignoreDuringBuilds:   intentionally omitted (default = false)
};

module.exports = nextConfig;