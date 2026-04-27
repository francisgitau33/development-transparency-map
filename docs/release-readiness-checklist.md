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