-- Organization multi-country support.
-- PRD: "Update implementing organization setup to support multiple operating
-- countries, including All Countries."
--
-- Additive migration:
--   1. New enum CountryScope (ALL | SELECTED).
--   2. New column Organization.countryScope (defaults to SELECTED so every
--      existing row is interpreted as "operates in one country").
--   3. Organization.countryCode relaxed to NULL so ALL-scope rows can clear
--      the legacy column.
--   4. New join table OrganizationCountry(organizationId, countryCode).
--   5. Backfill: for every existing organization that already has a
--      countryCode, insert a corresponding OrganizationCountry row so the
--      new multi-country read path returns the same value.
--
-- This migration is forward-compatible: code that still reads the legacy
-- Organization.countryCode column continues to work because the write path
-- keeps the legacy column in sync with the first selected country.

-- 1. CountryScope enum.
CREATE TYPE "CountryScope" AS ENUM ('ALL', 'SELECTED');

-- 2. Add countryScope column, defaulting to SELECTED for existing rows.
ALTER TABLE "Organization"
  ADD COLUMN "countryScope" "CountryScope" NOT NULL DEFAULT 'SELECTED';

-- 3. Relax legacy single-country column to nullable.
ALTER TABLE "Organization"
  ALTER COLUMN "countryCode" DROP NOT NULL;

-- Index for filtering by scope in analytics queries.
CREATE INDEX "Organization_countryScope_idx"
  ON "Organization"("countryScope");

-- 4. Join table.
CREATE TABLE "OrganizationCountry" (
  "organizationId" TEXT NOT NULL,
  "countryCode"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OrganizationCountry_pkey"
    PRIMARY KEY ("organizationId", "countryCode")
);

CREATE INDEX "OrganizationCountry_countryCode_idx"
  ON "OrganizationCountry"("countryCode");

CREATE INDEX "OrganizationCountry_organizationId_idx"
  ON "OrganizationCountry"("organizationId");

ALTER TABLE "OrganizationCountry"
  ADD CONSTRAINT "OrganizationCountry_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganizationCountry"
  ADD CONSTRAINT "OrganizationCountry_countryCode_fkey"
  FOREIGN KEY ("countryCode") REFERENCES "ReferenceCountry"("code")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Backfill: each existing organization with a countryCode that still
--    resolves to a ReferenceCountry row gets a matching OrganizationCountry
--    row. We JOIN rather than blanket-insert so orphaned historical codes
--    (e.g. seed data written before the reference table was populated) do
--    not break the FK constraint — those organizations remain SELECTED
--    with zero selected countries, which the UI surfaces as
--    "No country selected" and the validation layer will force the System
--    Owner to correct on next edit. ON CONFLICT DO NOTHING keeps the
--    migration idempotent if re-run on partially migrated data.
INSERT INTO "OrganizationCountry" ("organizationId", "countryCode")
SELECT o."id", o."countryCode"
FROM "Organization" o
INNER JOIN "ReferenceCountry" c ON c."code" = o."countryCode"
WHERE o."countryCode" IS NOT NULL
ON CONFLICT DO NOTHING;