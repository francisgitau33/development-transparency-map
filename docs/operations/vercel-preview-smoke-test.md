# Vercel Preview — smoke-test checklist

Short, repeatable manual checklist to run against a Vercel Preview
deployment **before** recommending promotion to production. This is
intentionally manual: it covers what automated tests do not (real DNS,
real TLS, real CSP enforced by the browser, real Upstash Redis, real
Sentry ingestion, real email provider).

This checklist assumes:

- The preview has all variables from the **Vercel Preview environment
  variable checklist** set
  (`docs/release-readiness-checklist.md` → "Vercel Preview environment
  variable checklist").
- The preview database has been migrated and seeded with a SYSTEM_OWNER
  account via the gated `db-migrate` workflow.
- You have a PARTNER_ADMIN test account and a SYSTEM_OWNER test account
  on the preview database.

Replace `<preview>` below with the preview URL, e.g.
`dtmap-preview.vercel.app`.

Record results inline on the Pull Request or release ticket (✅ / ❌
plus a one-line note). Any ❌ blocks promotion to production.

---

## 1. Home page
- [ ] `GET https://<preview>/` returns 200 in the browser.
- [ ] The public landing content renders — no blank white page, no
      hydration error banner in the console.
- [ ] Navigation (Home, About, Map, Login) is visible and all links
      resolve to a 200 on the same preview host.
- [ ] Footer social/contact links render (CMS-driven content is
      reachable).

## 2. About page
- [ ] `GET https://<preview>/about` returns 200.
- [ ] CMS-managed body copy renders. No "Failed to load" fallback.
- [ ] Team photo thumbnails load (no broken image icons, no CSP
      `img-src` violations in the console).

## 3. Public map
- [ ] `GET https://<preview>/` → map tab loads Leaflet tiles from
      OpenStreetMap without CSP violations.
- [ ] At least one marker is visible (seed data present).
- [ ] Clicking a marker opens a popup with only **public** fields
      (title, organisation, status). No DRAFT / PENDING_REVIEW projects
      are visible while logged out.
- [ ] The Organisation filter works and narrows the visible markers.

## 4. Login
- [ ] `GET https://<preview>/login` returns 200.
- [ ] Submitting a known-bad password returns a neutral "invalid
      credentials" message (no enumeration).
- [ ] Submitting valid SYSTEM_OWNER credentials lands on `/dashboard`.
- [ ] Session cookie in DevTools is `HttpOnly`, `Secure`, `SameSite=Lax`
      and the cookie domain matches the preview host.
- [ ] `POST /api/auth/login` response headers include `x-request-id`.

## 5. Dashboard access protection
- [ ] Logged out, `GET /dashboard` redirects to `/login`. Verify with a
      fresh incognito window (no stale cookie).
- [ ] As PARTNER_ADMIN, `/dashboard/audit` redirects or returns 403.
- [ ] As PARTNER_ADMIN, `GET /api/audit-events` returns 403.
- [ ] As an anonymous user, `GET /api/audit-events` returns 401.
- [ ] As SYSTEM_OWNER, `/dashboard/audit` loads and shows at least the
      LOGIN event from the session above.

## 6. CMS content
- [ ] As SYSTEM_OWNER, `/dashboard/cms` loads. Home, About, and Our
      Team editors are all reachable.
- [ ] Edit a single safe field (e.g. a paragraph on the About page),
      save, and confirm the change is visible on the public `/about`
      page after a refresh.
- [ ] Revert the edit.
- [ ] As PARTNER_ADMIN, `/dashboard/cms` either redirects or returns
      403 — PARTNER_ADMIN must not be able to edit CMS content.

## 7. CSV upload
- [ ] As PARTNER_ADMIN, `/dashboard/upload` loads and shows the CSV
      template download link.
- [ ] Uploading a CSV that is missing required headers returns 400 with
      a `missingHeaders[]` list surfaced in the UI.
- [ ] Uploading a valid small CSV (≤ 10 rows) succeeds. The resulting
      rows are `PENDING_REVIEW`, not `PUBLISHED`.
- [ ] An `UPLOAD_COMPLETED` event appears in `/dashboard/audit` as
      SYSTEM_OWNER.
- [ ] Uploading a CSV > 10,000 rows returns 413.
- [ ] As PARTNER_ADMIN, uploading six files within 60s: the sixth
      returns 429 with a `Retry-After` header.

## 8. Reports
- [ ] As SYSTEM_OWNER, `/dashboard/reports` renders all widget panels
      (Coverage, Data Quality, Efficiency, Funding, Risk, Spatial).
      No panel shows a permanent "Failed to load" state.
- [ ] Widgets render **platform-wide data by default** (not just the
      logged-in user's organisation).
- [ ] As PARTNER_ADMIN, `/dashboard/reports` shows platform-wide data
      by default; selecting a peer organisation narrows widgets to that
      org's **PUBLISHED** projects only.
- [ ] As PARTNER_ADMIN, selecting "My organisation" shows own-org
      DRAFT / PENDING_REVIEW as well as PUBLISHED.

## 9. Password reset
- [ ] Request a reset for a known test account via
      `/forgot-password`. Rate limit: hit this endpoint 4× in 60s; the
      4th must return 429.
- [ ] The reset email arrives at the test inbox. The link host matches
      `APP_URL`.
- [ ] Opening the link shows the reset form. Submitting a new password
      succeeds and allows login with the new password.
- [ ] Reusing the same reset link a second time returns the neutral
      "Invalid or expired reset link" error.
- [ ] **Log hygiene check** (see §12 below): search the Vercel runtime
      logs around the reset event. The normalised email, the reset
      token, the reset URL, the user's password, any `cookie` or
      `authorization` header value, and any raw request body MUST NOT
      appear. Only `reset_password.succeeded` with `userId` should be
      present.

## 10. Team photos
- [ ] `/about` team section renders all team photos without broken
      image icons.
- [ ] As SYSTEM_OWNER, edit a team member and upload a JPEG or PNG. The
      upload succeeds and the new photo appears on `/about` after a
      refresh.
- [ ] Attempting to upload a non-JPEG/PNG (e.g. `.gif`, `.webp`) is
      rejected by the server.
- [ ] As PARTNER_ADMIN, the Our Team CMS surface is not accessible.

## 11. CSP browser console errors
- [ ] Open `/`, `/about`, `/login`, `/dashboard`, `/dashboard/reports`
      and `/dashboard/cms` with DevTools → Console open in a fresh
      incognito window.
- [ ] No `Content Security Policy` violations logged.
- [ ] No `Refused to load the …` / `Refused to execute inline script`
      errors logged.
- [ ] `curl -I https://<preview>/ | grep -iE 'content-security-policy|strict-transport-security|x-frame-options|x-content-type-options|referrer-policy|permissions-policy'`
      returns all six headers.
- [ ] `HSTS` is present only on HTTPS responses (Vercel serves HTTPS
      for previews, so this should always be true).

## 12. Sentry test event
- [ ] Confirm `SENTRY_DSN` and `SENTRY_ENVIRONMENT=preview` are set on
      the Preview environment.
- [ ] Trigger a deliberate server error from a test-only route (or
      temporarily hit a 500 path) and verify the event reaches the
      Sentry `preview` environment within ~1 minute.
- [ ] Open the Sentry event. Verify there is **no** request body,
      `Authorization` header, `Cookie` header, `X-API-Key`, password,
      or reset token in the captured payload.
- [ ] The event carries an `x-request-id` tag (or a `requestId` extra)
      that matches the value returned by the failing API response.

## 13. Upstash rate-limit verification
- [ ] Confirm `RATE_LIMIT_BACKEND=redis` and both
      `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set on
      Preview.
- [ ] Send 11 POSTs in quick succession to
      `https://<preview>/api/auth/login` from a single IP with a random
      email. The 11th must return 429 with headers
      `X-RateLimit-Limit`, `X-RateLimit-Remaining: 0`, and
      `Retry-After`.
- [ ] Inspect the Upstash database **Data Browser**: the matching
      rate-limit key (e.g. `rl:login:<ip>`) exists and its TTL is
      ≤ 60 s.
- [ ] Grep the Vercel runtime logs for `rate_limit.redis_fallback` —
      it should **not** appear during this test. If it does, Upstash is
      unreachable from the preview runtime and the env vars or Upstash
      project need investigation before promoting.
- [ ] Wait for the window to expire and confirm the endpoint accepts
      requests again.

---

## Pass criteria

All 13 sections above must pass. If any one fails, the preview is not
ready to be promoted to production — file a fix and re-run the section
after deploying the fix. Record the final state (✅ all sections) on
the release ticket before promotion.