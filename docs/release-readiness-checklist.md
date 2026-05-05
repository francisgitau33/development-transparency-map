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
| `SYSTEM_OWNER_EMAIL` | ✅ **required for seed** | `prisma/seed.ts`, `src/lib/branding.ts` | Email of the initial System Owner. The seed has no default fallback — running `prisma db seed` without this variable will fail with a clear error. Used by `src/lib/branding.ts` for owner-only UI hints. |
| `SYSTEM_OWNER_PASSWORD` | ⚠️ seed-only | `prisma/seed.ts` | ONLY used by the seed script. Rotate immediately after first login. Do NOT leave this in the deployment environment after seed. If omitted, the seed logs a warning and skips System Owner creation (other seed steps still run). |

Other variables you may set:
- `PORT` — Next.js listen port (defaults to 3000).
- `BUILD_DIR` — lets you keep multiple build outputs side-by-side during
  CI / rollbacks (the CI workflow uses `.next-build-ci`).

### Sprint 1 production hardening — additional variables

Added as part of the production-hardening sprint. The first two are
**required** for any multi-replica deployment (e.g. Vercel). Without
them, the rate limiter falls back to a process-local in-memory counter
that can be trivially bypassed by hitting different replicas.

| Variable | Required? | Used by | Notes |
|---|---|---|---|
| `UPSTASH_REDIS_REST_URL` | ✅ (production, multi-replica) | `src/lib/rate-limit.ts` | Upstash-compatible Redis REST endpoint, e.g. `https://<id>.upstash.io`. When blank, the limiter falls back to in-memory. |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ with URL | `src/lib/rate-limit.ts` | Bearer token for the REST endpoint. If URL is set without token, the limiter refuses to use Redis and logs a fallback warning. |
| `RATE_LIMIT_BACKEND` | optional | `src/lib/rate-limit.ts` | `auto` (default): use Upstash when configured, otherwise in-memory. `redis`: force Upstash — throws at first request if env vars are missing. `memory`: force in-memory — only for tests. |
| `SENTRY_DSN` | recommended (production) | `src/instrumentation.ts`, `src/lib/logger.ts` | Activates Sentry error reporting. When blank, Sentry is inert — the structured logger still emits JSON lines to stdout/stderr, but errors are not forwarded to Sentry. |
| `SENTRY_ENVIRONMENT` | optional | `src/instrumentation.ts` | Labels Sentry events (`production`, `staging`, `preview`). Defaults to `NODE_ENV`. |
| `SENTRY_TRACES_SAMPLE_RATE` | optional | `src/instrumentation.ts` | Float 0–1. Defaults to 0 (off). |

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
- [ ] Run the System Owner seed once with both env vars set explicitly:
      `SYSTEM_OWNER_EMAIL=owner@example.org SYSTEM_OWNER_PASSWORD=ChangeMe123! bunx tsx prisma/seed.ts`.
      The seed refuses to run without `SYSTEM_OWNER_EMAIL` (there is no
      default fallback). Confirm a single `Role { role: SYSTEM_OWNER }`
      row exists.
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

Reports are a **read** surface. Since 2026-05-01 the RBAC split is:

| Surface | SYSTEM_OWNER | PARTNER_ADMIN |
|---|---|---|
| Reports & Development Intelligence (read) | Platform-wide; may narrow via `?organizationId=` | Platform-wide; own-org at any visibility **OR** other orgs' `PUBLISHED` only; may narrow via `?organizationId=` |
| Project create / edit / delete (write) | All orgs | Own-org only |
| CSV upload (write) | All orgs | Own-org only |
| Organization edit / user mgmt / CMS / audit | Full | Blocked |

Authoritative helper: `src/lib/report-scope.ts` (`buildReportOrgVisibilityScope`). Route wiring: `/api/analytics`, `/api/reports/development-analytics`, `/api/reports/funding-cliffs`, `/api/reports/spatial-vulnerability`. Test coverage: `tests/report-scope.test.ts`, `tests/api/analytics.test.ts`, `tests/api/reports.test.ts`.

- [ ] Log in as a PARTNER_ADMIN and open `/dashboard/reports`. Confirm the
      widgets show **platform-wide** data by default (not just the
      partner's own organisation), and the Organisation filter lists more
      than the partner's own org (populated via
      `/api/organizations?scope=directory`).
- [ ] Repeat with a SYSTEM_OWNER account. Confirm widgets show platform-
      wide data by default.
- [ ] As PARTNER_ADMIN, pick a peer organisation in the report
      Organisation filter. The aggregates MUST reflect only that peer's
      **PUBLISHED** projects — never DRAFT / PENDING_REVIEW / UNPUBLISHED.
- [ ] As PARTNER_ADMIN, confirm own-organisation DRAFT / PENDING_REVIEW
      rows DO appear in "All organisations" and in "My organisation"
      filter selections.
- [ ] As PARTNER_ADMIN, attempt project create / edit with
      `organizationId` of a peer org (via the API). Must still be 403.
      Write scope is unchanged.
- [ ] As PARTNER_ADMIN, open `/dashboard/audit` directly. Still 403.

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

## Population data (Prompt 7 · Part K)

Administrative Areas (Districts / Counties / Regions) carry an optional
block of population metadata that feeds the population-weighted
reporting widgets in `/dashboard/reports`:

- `estimatedPopulation` — positive whole number. Zero is **rejected** by
  the validation layer so no report can ever divide by zero.
- `populationYear` — calendar year, `1900 ≤ year ≤ currentYear + 1`.
- `populationSource` — free-text label, e.g. "National Census 2019".
- `populationSourceUrl` — optional URL back to the source dataset.
- `populationNotes` — caveat, projection note, methodology flag, etc.

Operational guidance:

- **Population fields are optional but recommended.** A missing
  `estimatedPopulation` does not break reports; affected areas are
  surfaced as "Population data missing" and are excluded from ranking,
  never coerced to zero.
- **Record the year and source whenever possible.** These drive the
  Population Data Completeness widget in the Data Quality section and
  the "Data Completeness" column of the High Population / Low Recorded
  Coverage Watchlist. Saving without year/source is allowed but shows
  as incomplete in Data Quality.
- **Review and refresh population estimates periodically.** Estimates
  older than ~10 years auto-trigger a neutral "Population estimates are
  drawn from different years…" note on the report. There is no
  automated import from external census APIs and none is planned for
  MVP.
- **Population-adjusted metrics are only as reliable as the entered
  data.** Every population-weighted widget links back to a persistent
  interpretation note:
  "Population-adjusted metrics compare recorded project data against
  estimated District / County population values entered in the platform.
  They do not prove need, deprivation, or underfunding on their own."
- **Mock / seed population values must not be presented as official.**
  The seed script labels mock values with the source string
  `"Development Transparency Map mock data (non-official)"` and a
  "Mock value for demonstration only." note. Do not copy seed values
  into a production database and treat them as sourced statistics.

Access control for these fields is identical to the rest of the
Administrative Area record: **only SYSTEM_OWNER** may create / edit /
deactivate, and the System Owner CMS form at
`/dashboard/cms/administrative-areas` is the only UI surface that
exposes write operations.

---

## Country Development Context (Prompt 8)

Each `ReferenceCountry` carries an optional set of manually entered
context indicators, exposed through the `CountryIndicator` table. These
drive the **Country Development Context** panel on the Reports page and
the Country Context Completeness section in Data Quality.

Supported indicator keys (controlled vocabulary, see
`src/lib/country-context.ts`):

| Key | Label | Notes |
|---|---|---|
| `GDP_PER_CAPITA_CURRENT_USD` | GDP per capita, current USD | value ≥ 0 |
| `HDI_SCORE` | HDI score | 0 ≤ value ≤ 1 |
| `HDI_RANK` | HDI rank | rank is a positive integer |
| `POVERTY_RATE` | Poverty rate | 0 ≤ value ≤ 100 (with unit `%`) |
| `ODA_RECEIVED_PER_CAPITA` | ODA received per capita | value ≥ 0 |
| `ODA_AS_PERCENT_GNI` | ODA as % of GNI | value ≥ 0 (upper bound 500 to catch typos) |

Operational guidance:

- **Country indicator values are manually entered and must ALWAYS be
  interpreted alongside their `source` + `year`.** The Reports page
  appends the standard caveat on every render:
  *"Country context indicators are manually entered and should be
  interpreted with reference to their stated source and year."*
- **Country population is calculated, not stored.** The Reports page
  and CMS both derive the calculated country population from active
  Administrative Area records (`estimatedPopulation > 0`). If any
  districts / counties are missing population, the "Population data
  completeness" figure drops below 100% and the UI surfaces a note:
  *"Country population is calculated from District / County population
  records in the platform and may be understated if population data is
  incomplete."*
- **Review population completeness before interpreting per-capita or
  country comparisons.** Low completeness propagates into every
  population-weighted widget downstream.
- **Record source + year on every indicator row.** Source URL is
  optional but strongly recommended. A row without a source renders
  with the neutral marker "Source not recorded" in the UI.
- **Indicators older than five years are flagged as outdated** in the
  Data Quality section with a neutral warning:
  *"Some country context indicators are missing or outdated. Interpret
  country-level comparisons cautiously."* They are NOT hidden — the
  operator decides how to act on them.
- **Do not treat mock / seed values as official.** The seed script
  labels every row with source `"Development Transparency Map mock data
  (non-official)"` and notes `"Mock value for demonstration only."`.
  Do not migrate mock values into a production database.
- **Up to five years per indicator per country.** The CMS UI enforces
  this cap; the API enforces the underlying
  `@@unique([countryCode, indicatorKey, year])` constraint.
- **Business Environment / Business Ready score is RESERVED for a
  future phase.** It is intentionally NOT in `ALLOWED_INDICATOR_KEYS`.

Recommended source guidance (not fetched automatically — all values are
manually entered):

- **GDP per capita**: World Bank World Development Indicators, or the
  relevant national statistics office.
- **HDI score / rank**: UNDP Human Development Reports.
- **Poverty rate**: World Bank, or the relevant national statistics
  office (record the stated poverty line in `notes`).
- **ODA**: OECD Creditor Reporting System, World Bank, or the relevant
  national aid-management platform.

Access control:

- Read: any authenticated dashboard user. Partner Admins see the
  Country Development Context panel when their selected country has
  indicators recorded; their project-level analytics remain scoped to
  their own organisation.
- Write: **SYSTEM_OWNER only**. Managed through
  `/dashboard/cms/countries/<code>/context` and the corresponding
  `/api/reference/countries/:code/context` endpoint. Partner Admins
  receive a 403 on any write attempt.

---

## Prompt 9 — Population persistence & Country Context form fixes

Two targeted bug fixes verified in this release:

1. **Administrative Area population persistence** —
   `PUT /api/reference/administrative-areas/:id` is now a true partial
   update. Fields omitted from the request body are preserved from the
   existing row; fields sent as explicit `null` (or empty string) are
   intentionally cleared. This resolves the reported regression where
   clicking *Deactivate* — which sends only `{ active }` — silently wiped
   `estimatedPopulation`, `populationYear`, `populationSource`,
   `populationSourceUrl`, and `populationNotes`. Covered by
   `tests/api/administrative-areas.test.ts` (14 new tests), including a
   dedicated regression case for the activate/deactivate path.

2. **Country Development Context form gap** — the *Add Country* modal on
   `/dashboard/cms/countries` now explicitly routes a freshly-created
   country to `/dashboard/cms/countries/<code>/context` so the SYSTEM_OWNER
   can enter GDP per capita, HDI, poverty, and ODA indicators right away.
   The *Edit Country* modal shows a prominent "Manage context" shortcut
   that opens the same page. Country population is still calculated from
   District / County records and cannot be entered at country level.

No schema changes. No new migrations. Validation rules, auth / RBAC, and
the country-context API contract are unchanged.

---

## Sprint 1 production hardening (summary)

This section summarises the production-hardening changes shipped in
Sprint 1 following the Systems Engineering Review. They are additive —
no product features, no RBAC changes.

### HTTP security headers
- `Content-Security-Policy`, `Strict-Transport-Security`,
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and a narrow
  `Permissions-Policy` are emitted by `next.config.js` for every
  production response. A looser development-only CSP is used so the
  Next.js dev server + Design Mode tooling keep working.
- Documented CSP exceptions (intentional):
  - `script-src 'unsafe-inline' 'unsafe-eval'` — required by Next.js 15
    App Router; nonce-based CSP is tracked as a follow-up.
  - `style-src 'unsafe-inline'` — Tailwind + Radix / shadcn runtime
    style injection.
  - `img-src https:` — user-supplied organisation logos, team photos,
    CMS images, and map imagery come from arbitrary HTTPS hosts.
- Verification: `curl -I https://<env>/ | grep -iE 'content-security|strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy'`.

### Rate limiting (Upstash)
- `src/lib/rate-limit.ts` now uses Upstash Redis via the REST API when
  `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set. Falls
  back to the process-local in-memory counter otherwise (safe for dev
  and CI, NOT safe for multi-replica production).
- On any Upstash error the limiter fails open to in-memory and logs a
  structured `rate_limit.redis_fallback` warning so the incident is
  visible in Sentry / log aggregation.
- All existing call sites (`/api/auth/login`, `/api/auth/register`,
  `/api/auth/forgot-password`, `/api/upload`) use the same shape —
  only the type is now `Promise<RateLimitResult>`.

### Structured logging + Sentry
- `src/lib/logger.ts` emits single-line JSON at info / warn / error
  levels and deep-redacts secret-like keys (`password`, `token`,
  `secret`, `authorization`, `cookie`, `apiKey`, `resetLink`,
  `resetUrl`, and any `body` / `requestBody` / `rawBody`). `resetLink`
  and `resetUrl` are never logged — forgot-password tokens are
  delivered through `src/lib/email.ts` only.
- `src/instrumentation.ts` activates `@sentry/nextjs` when `SENTRY_DSN`
  is set, with `beforeSend` redacting `Authorization` / `Cookie` /
  `X-API-Key` / request body. `onRequestError` forwards unhandled
  errors to Sentry.
- Every API response from the auth / upload routes now includes an
  `x-request-id` header. The middleware at `src/middleware.ts`
  attaches the same header to every `/api/**` and `/dashboard/**`
  response, honouring inbound `x-request-id` / `x-vercel-id`.
- Logger redaction is covered by `src/lib/logger.test.ts` (12 tests,
  including "secret string must not appear in log output").

### Build-time quality gates
- `next.config.js` no longer sets `typescript.ignoreBuildErrors` or
  `eslint.ignoreDuringBuilds`. `bunx tsc --noEmit` and `bunx biome
  lint ./src` now block release on failure.

### Deployment target
- Vercel is the single production deployment target. `Dockerfile`,
  `Dockerfile.base`, and `netlify.toml` have been moved under
  `deploy/inactive/` with a README explaining their inactive status.
  `vercel.json` + `next.config.js` (`distDir: .next-build`) remain
  consistent and match `.github/workflows/quality.yml`.

### Database operations
- `docs/operations/database-backup-restore.md` covers backup cadence
  (provider PITR + weekly `pg_dump`), quarterly restore drill, RPO ≤
  24 h / RTO ≤ 4 h assumptions, and the production migration process.
- `.github/workflows/db-migrate.yml` gates `prisma migrate deploy`
  behind a manual `workflow_dispatch` + typed "MIGRATE" confirmation +
  GitHub Environment required reviewer.

---

## Next prompt candidates (out of scope here)

These are tracked for awareness — they must not be started without
explicit approval.

- ~~**Multi-replica rate limiting**~~: **Done in Sprint 1**. Upstash
  Redis REST backend with in-memory fallback — see
  `src/lib/rate-limit.ts`, the new `UPSTASH_REDIS_REST_URL` /
  `UPSTASH_REDIS_REST_TOKEN` env vars above, and
  `src/lib/rate-limit.test.ts` for coverage of allowed / blocked /
  reset-window / Upstash / fallback paths.
- **Playwright smoke test**: once a stable seed DB is available in CI,
  add a single `public homepage → map → login` smoke flow.
- **Email deployment configuration**: per-provider runbook (Resend,
  SendGrid, Postmark) and DKIM / SPF setup.
- **Sector Concentration by District / County** widget — deferred per
  Prompt 5 scope.
- **Population boundary data / polygon heatmaps** — out of scope for
  Prompt 7. Population is recorded as a numeric estimate per admin
  area only; no GeoJSON boundary datasets are fetched or stored.
- **Automated population import** from external census APIs — out of
  scope. Population data is entered manually through the CMS.
- **Business Environment / Business Ready score** — the sixth country
  development indicator reserved by Prompt 8. Not implemented in this
  phase; must not be added without explicit approval.
- **Automated country indicator import** from World Bank, UNDP, OECD or
  any other external API — out of scope. All `CountryIndicator` rows
  are entered manually by a SYSTEM_OWNER.