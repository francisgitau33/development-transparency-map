-- Reference Data Soft-Delete (Reference Data Delete — PRD §9.x)
--
-- Adds nullable `deletedAt` + `deletedByUserId` columns to the four user-
-- editable reference tables so SYSTEM_OWNERs can delete rows without
-- orphaning downstream project / organization / upload data. Indexes on
-- `deletedAt` keep the default-hiding `deletedAt IS NULL` filter fast.
--
-- Additive only — no data is rewritten and every existing row keeps both
-- new columns as NULL (i.e. "not deleted"). This migration is safe to
-- replay and does not require a downtime window.

-- AlterTable
ALTER TABLE "ReferenceCountry" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT;

-- AlterTable
ALTER TABLE "AdministrativeArea" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT;

-- AlterTable
ALTER TABLE "Donor" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT;

-- AlterTable
ALTER TABLE "ReferenceSector" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "ReferenceCountry_deletedAt_idx" ON "ReferenceCountry"("deletedAt");

-- CreateIndex
CREATE INDEX "AdministrativeArea_deletedAt_idx" ON "AdministrativeArea"("deletedAt");

-- CreateIndex
CREATE INDEX "Donor_deletedAt_idx" ON "Donor"("deletedAt");

-- CreateIndex
CREATE INDEX "ReferenceSector_deletedAt_idx" ON "ReferenceSector"("deletedAt");