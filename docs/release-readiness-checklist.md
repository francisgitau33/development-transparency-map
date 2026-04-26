# Release Readiness Checklist — Development Transparency Map

**Scope**: MVP release candidate (post Prompt 5 hardening + Prompt 6 test
harness). Covers production configuration, pre-launch verification, and
post-launch monitoring.

This file is the single source of truth for "what must be true before we
flip this on in production". It is not a general ops runbook; it captures
only the constraints this codebase actually enforces or depends on.

---

## 1. Required production environment variables

All of these MUST be present when `NODE_ENV=production`. A missing value
will either cause the app to throw at start (security-critical cases like
`JWT_SECRET`) or silently degrade (CAPTCHA, email).

| Variable | Required? | Used by | Notes |
|---|---|---|---|
| `DATABASE_URL` | ✅ | `@prisma/client` everywhere | PostgreSQL connection string. Must be reachable from every Next.js replica. |
| `JWT_SECRET` | ✅ | `src/lib/jwt-secret.ts`, `src/lib/session.ts`, `src/middleware.ts` | **Production throws on missing / whitespace value.** Use a cryptographically random string ≥ 32 bytes. Rotate on any suspected compromise. |
| `NODE_ENV` | ✅ | Multiple (captcha, jwt-secret, prisma client cache) | Must be `production`. Some security fail-closed paths key off this value. |
| `APP_URL` | ✅ | Email links (password reset), canonical URLs | Absolute URL, e.g. `https://dtmap.example.org`. |
| `EMAIL_PROVIDER` | ✅ | `src/lib/email.ts` | Provider identifier (e.g. `resend`). If unset, password-reset and admin emails are skipped and a warning is logged. |
| `RESEND_API_KEY` (or provider-equivalent API key) | ✅ | `src/lib/email.ts` | Provider API key for the chosen provider. |
| `EMAIL_FROM` | ✅ | `src/lib/email.ts` | Sender address. Must be a verified domain/identity with the provider. |
| `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` | ✅ | `src/components/auth/HCaptchaWidget.tsx` | Public site key. Safe to embed in the client bundle. |
| `HCAPTCHA_SECRET` | ✅ | `src/lib/captcha.ts` | Server-side verify secret. If missing in production, registrations are **refused** with a 500 to avoid running without CAPTCHA protection. |
| `SYSTEM_OWNER_EMAIL` | ✅ (seed only) | `prisma/seed.ts`, `src/lib/branding.ts` | Email of the initial System Owner. Used by the seed script to bootstrap the first account. |
| `SYSTEM_OWNER_PASSWORD` | ⚠️ seed-only | `prisma/seed.ts` | ONLY used by the seed script. Rotate immediately after first login. Do NOT leave this in the deployment environment after seed. |

Other variables you may set:
- `PORT` — Next.js listen port (defaults to 3000).
- `BUILD_DIR` — lets you keep multiple build outputs side-by-side during
  CI / rollbacks (the CI workflow uses `.next-build-ci`).

**Never commit** real values of any of the above. Use your platform's
secret manager. The `.env` file in the repo is a developer convenience
only and MUST contain placeholders or be `.gitignore`d.

---

## 2. Pre-launch checks

Perform these on the target environment, in order, before announcing
availability.

### Database
- [ ] Confirm `DATABASE_URL` points at the correct production cluster.
- [ ] Run `bunx prisma migrate deploy` and verify status is "No pending
      migrations".
- [ ] Run the System Owner seed once: `bunx tsx prisma/seed.ts`. Confirm
      a single `Role { role: SYSTEM_OWNER }` row exists.
- [ ] **Rotate the seed password**: log in as the System Owner and change
      the password immediately. Unset `SYSTEM_OWNER_PASSWORD` in the
      deployment environment afterwards.

### Email
- [ ] Trigger a password-reset email for a test account and confirm it
      arrives (check spam too). Verify the reset link opens the reset page
      and accepts the new password.
- [ ] Confirm `EMAIL_FROM` renders correctly on the delivered message.

### Auth / CAPTCHA
- [ ] Register a new account from the public sign-up page. The hCaptcha
      challenge MUST appear and solve successfully before submission. A
      registration submitted without a token MUST be rejected with 400.
- [ ] Log in, log out, and log back in. Confirm the session cookie is
      `HttpOnly`, `Secure`, and `SameSite=Lax`.

### Audit log
- [ ] Log in as SYSTEM_OWNER, open `/dashboard/audit`. Confirm the page
      loads, at least the LOGIN event is present, and filters reduce the
      result set as expected.
- [ ] Log in as PARTNER_ADMIN and navigate to `/dashboard/audit` directly.
      Confirm the page redirects or 403s (Partner Admin MUST NOT see the
      audit log).
- [ ] `GET /api/audit-events` as an anonymous user returns 401. As
      PARTNER_ADMIN returns 403. As SYSTEM_OWNER returns 200.

### Public map
- [ ] Open `/` logged out. Only PUBLISHED projects must appear on the
      map. Pending-review projects must NOT be visible.
- [ ] Click a marker — the popup shows the project's public fields only.

### Role scoping (defense-in-depth)
- [ ] Log in as a PARTNER_ADMIN and open `/dashboard/reports`. Confirm the
      widgets show their organisation's data only (not platform-wide).
- [ ] Repeat with a SYSTEM_OWNER account. Confirm widgets show platform-
      wide data by default.
- [ ] As PARTNER_ADMIN, attempt to pass `?organizationId=OTHER_ORG` on the
      reports URLs. Data returned MUST remain the partner's own org.
      (Route code enforces this; test coverage: `tests/api/reports.test.ts`.)

### Uploads
- [ ] Upload a CSV with missing required columns — server rejects with
      400 and lists `missingHeaders[]`.
- [ ] Upload a CSV with > 10,000 rows — server rejects with 413.
- [ ] Upload a small, well-formed CSV as PARTNER_ADMIN. Verify rows land
      in `PENDING_REVIEW`, not `PUBLISHED`, and an `UPLOAD_COMPLETED` audit
      event is emitted.

### Rate limits
- [ ] Hit `/api/auth/login` 11× from the same IP within 60s. 11th response
      MUST be 429 with neutral wording.
- [ ] Hit `/api/auth/forgot-password` 4× from the same IP within 60s. 4th
      response MUST be 429.
- [ ] Hit `/api/upload` 6× from the same user account within 60s. 6th MUST
      be 429.

### Quality gates
- [ ] CI workflow "MVP Quality Checks" is green on `main`.
- [ ] No `.env` file, JWT secret, database URL, or email provider key is
      present in the git history.
- [ ] `bun run lint && bun run test && bun run build` all pass locally.

---

## 3. Post-launch monitoring

For the first 48 hours and weekly thereafter, review the following. Lines
marked **(audit)** are queryable from `/dashboard/audit`.

- **Authentication failures**
  - Spikes in "LOGIN_FAILED" events **(audit)** from a small set of IPs or
    accounts → probable credential-stuffing. Tighten IP rate-limit window
    or block at the edge.
  - 429s on `/api/auth/login` and `/api/auth/register` — surge indicates a
    bot attempt; investigate.

- **Upload errors**
  - `UPLOAD_COMPLETED` events **(audit)** whose `invalidRows` dominate
    `validRows` — likely schema or template drift. Update the template
    doc and notify the responsible partner.
  - `/api/upload` 413 count — if non-zero, advise partners to split the
    file rather than raising the server cap.

- **Rate-limit behaviour**
  - X-RateLimit-Remaining headers in application logs. A busy org hitting
    the upload limit regularly is the signal to move to Redis-backed
    rate-limiting (see "Next prompt candidates" at the bottom of this
    file).

- **Audit coverage**
  - Review `PROJECT_CREATED`, `PROJECT_UPDATED`, `PROJECT_DELETED` counts
    **(audit)** against expectation. An unusual spike in deletes should
    be investigated.
  - `USER_APPROVED` and `USER_DECLINED` **(audit)** — verify that every
    Partner Admin approval was performed by an authorised System Owner.

- **Password-reset**
  - Failed reset attempts (invalid / expired tokens) trending upward →
    may indicate a phishing campaign against registered accounts or an
    email-delivery issue.
  - Email provider bounce / complaint rate.

- **Report endpoint performance**
  - 95th-percentile latency on `/api/reports/development-analytics`,
    `/api/reports/funding-cliffs`, and `/api/reports/spatial-vulnerability`.
    These are unbatched per-request aggregations; if they exceed ~2s
    regularly, the next step is caching (keyed by filters + org scope)
    rather than a heavier rewrite.

---

## Next prompt candidates (out of scope here)

These are tracked for awareness — they must not be started without
explicit approval.

- **Multi-replica rate limiting**: swap the in-memory rate-limit store in
  `src/lib/rate-limit.ts` for a Redis / Upstash-backed store.
- **Playwright smoke test**: once a stable seed DB is available in CI,
  add a single `public homepage → map → login` smoke flow.
- **Email deployment configuration**: per-provider runbook (Resend,
  SendGrid, Postmark) and DKIM / SPF setup.
- **Sector Concentration by District / County** widget — deferred per
  Prompt 5 scope.