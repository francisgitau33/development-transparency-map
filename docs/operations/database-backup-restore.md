# Database Backup, Restore & Migration Deployment

**Scope**: production PostgreSQL database (the single `DATABASE_URL` used
by the Development Transparency Map Next.js app). Covers backup cadence,
restore drills, recovery objectives, and the process for shipping
Prisma migrations to production.

This document is the operator-facing companion to the developer-facing
[`release-readiness-checklist.md`](../release-readiness-checklist.md).

---

## 1. Recovery objectives (assumptions)

| Objective | Target | Notes |
|---|---|---|
| **RPO** (Recovery Point Objective) | **≤ 24 h** | Daily automated logical dump + platform-level continuous WAL (managed Postgres only). |
| **RTO** (Recovery Time Objective) | **≤ 4 h** | Time from "decision to restore" to "app serving traffic against the restored DB" for the current dataset size (tens of MB). Scale this assumption if the dataset grows past ~5 GB. |
| **Retention** | **30 daily** + **12 monthly** snapshots | Monthly snapshots are pinned on the 1st of each calendar month. |
| **Geo-redundancy** | Snapshots copied to a region different from the primary DB. | Required for disaster-level recovery. |

These are **planning assumptions for the MVP launch**. They must be
re-validated if the dataset or the transaction volume materially
changes, and formally approved by the product owner before any binding
SLA is given to partners.

---

## 2. Backup cadence

Two layers of backup are required in production. Either layer alone is
not sufficient.

### 2a. Managed-DB platform snapshots (primary)

Whichever managed PostgreSQL is used (e.g. Neon, Supabase, RDS, Crunchy
Bridge, Aiven), enable the provider's built-in backup feature with:

- **Continuous WAL / PITR** (point-in-time recovery) turned on.
- **Daily full snapshots** retained for at least 30 days.
- **Cross-region replication** of snapshots if offered.

Record the provider, retention window, and PITR window in the operations
runbook and in `/dashboard/audit` under a one-off note
(`entityType: "Runbook"`) so the configuration is discoverable from
inside the app.

### 2b. Application-level `pg_dump` (secondary, portable)

A weekly logical dump is also required. `pg_dump` output is portable
between providers and is the backup the team can rehearse without
needing the provider's console.

Example cron target (GitHub Actions scheduled workflow or an external
scheduler — NOT the Next.js app):

```bash
pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --file "dtmap-$(date -u +%Y%m%dT%H%M%SZ).dump" \
  "$DATABASE_URL"

# Upload to object storage with server-side encryption.
aws s3 cp "dtmap-*.dump" "s3://<bucket>/db-backups/" \
  --sse AES256 \
  --storage-class STANDARD_IA
```

Cadence:
- **Weekly full dump**, retained for 12 weeks.
- **Monthly full dump**, retained for 12 months.

Encryption + access control:
- Backups MUST be stored in an encrypted bucket / volume.
- Access is limited to the on-call operator role — NO shared
  service-account credentials.

---

## 3. Restore drill (mandatory, quarterly)

A backup is only real if it can be restored. Run this drill once per
calendar quarter; file a confirmation note in the release-readiness
checklist's "Post-launch monitoring" audit review.

### 3a. Provider-snapshot restore

1. In the managed-DB console, **clone** the latest daily snapshot into a
   fresh database instance named `dtmap-restore-test-<YYYYMMDD>`.
2. Connect with `psql` and run the integrity smoke queries:
   ```sql
   SELECT count(*) FROM "User";
   SELECT count(*) FROM "Project";
   SELECT count(*) FROM "AuditEvent";
   SELECT max("uploadedAt") FROM "UploadJob";
   ```
3. Point a local Next.js build at the restored database (set
   `DATABASE_URL` in a throwaway `.env.restore-test`), run
   `bunx prisma migrate status`, and confirm "No pending migrations".
4. Start the app locally against the restored DB and verify login +
   dashboard render for a known test account.
5. Delete the clone. Record the drill outcome (date, operator, RTO
   measured, anomalies).

### 3b. `pg_dump` restore

Use this path when the provider itself is unavailable.

```bash
createdb dtmap_restore
pg_restore \
  --no-owner \
  --no-acl \
  --dbname=dtmap_restore \
  dtmap-<timestamp>.dump
```

Then run step 2–5 from section 3a above against `dtmap_restore`.

**Pass criteria**: all smoke queries return non-zero counts, Prisma
reports no pending migrations, and a local app build can log in.

---

## 4. Production migration process

Schema changes are shipped via Prisma migrations checked into git under
`prisma/migrations/**`. Running `prisma migrate dev` against production
is **forbidden** — it can rewrite migration history.

### 4a. Authoring a migration (developer, local)

```bash
# Never run against production.
DATABASE_URL=<local-dev> bunx prisma migrate dev --name <slug>
bunx prisma generate
```

Commit the generated `prisma/migrations/<timestamp>_<slug>/` folder,
including `migration.sql`. Do NOT hand-edit the SQL after it has been
committed and merged.

### 4b. Pre-deploy checks (CI)

The `MVP Quality Checks` workflow (`.github/workflows/quality.yml`)
already runs `bunx prisma generate` + `bunx tsc --noEmit` +
`bunx vitest run` + `next build` on every PR. A migration PR MUST NOT
merge unless all four are green.

### 4c. Deployment (controlled, gated)

Use the `Database Migrate (Production)` workflow
(`.github/workflows/db-migrate.yml`). This is a **manual, approval-gated
workflow** — it does not run on every push.

Runbook:

1. Merge the migration PR into `main`.
2. In the GitHub Actions UI, open the `Database Migrate (Production)`
   workflow and click **Run workflow**.
3. Pick the target environment (`production` or `staging`). The
   `production` environment is protected with **required reviewers**;
   the job pauses until an approver clicks "Approve and deploy".
4. The job runs:
   ```bash
   bun install --frozen-lockfile
   bunx prisma migrate deploy
   ```
   `migrate deploy` applies only pending migrations — it never
   generates new ones — and is safe to re-run.
5. After the workflow completes green, deploy the app on Vercel. The
   correct order is **migrate first, then deploy the app** so the app
   never runs against a schema it does not expect.
6. Record the deploy in the audit log (already automatic — the app
   writes `PROJECT_*` / `CMS_*` events; for infrastructure events the
   operator pastes the workflow run URL into the post-launch monitoring
   review document).

### 4d. Rollback

If a migration causes a production incident:

1. Decide between **schema rollback** and **full restore**. Schema
   rollback is usually cheaper, but Prisma does not generate down
   migrations automatically — you must author one manually.
2. If rollback is not feasible, restore the most recent pre-migration
   snapshot following section 3a. Expect data loss equal to the time
   elapsed since the snapshot (within the RPO).
3. Revert the migration PR in git. Re-deploy the app against the
   restored DB only after `prisma migrate status` reports "No pending
   migrations".

---

## 5. What MUST NOT happen

- Running `prisma migrate dev` against the production `DATABASE_URL`.
- Editing a committed `migration.sql` file.
- Using `prisma db push` in production (it bypasses migration history).
- Storing `pg_dump` output unencrypted, or in an object-storage bucket
  that is publicly readable.
- Skipping the quarterly restore drill because "backups are automated".
- Applying a schema migration from a developer's laptop "just this once"
  instead of through the approval-gated workflow.

---

## 6. Ownership

| Responsibility | Owner |
|---|---|
| Backup cadence configuration (provider) | Platform / DevOps |
| Quarterly restore drill | Platform / DevOps |
| Prisma migration authoring | Backend engineers |
| Migration deploy approval | Engineering lead |
| Incident response (DB outage) | On-call engineer, escalate to Eng lead |