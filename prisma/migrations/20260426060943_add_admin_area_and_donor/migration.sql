-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "administrativeAreaId" TEXT,
ADD COLUMN     "donorId" TEXT;

-- CreateTable
CREATE TABLE "AdministrativeArea" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "countryCode" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdministrativeArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Donor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "donorType" TEXT,
    "countryOfOrigin" TEXT,
    "website" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Donor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdministrativeArea_countryCode_idx" ON "AdministrativeArea"("countryCode");

-- CreateIndex
CREATE INDEX "AdministrativeArea_active_idx" ON "AdministrativeArea"("active");

-- CreateIndex
CREATE INDEX "AdministrativeArea_sortOrder_idx" ON "AdministrativeArea"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AdministrativeArea_countryCode_name_key" ON "AdministrativeArea"("countryCode", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Donor_name_key" ON "Donor"("name");

-- CreateIndex
CREATE INDEX "Donor_active_idx" ON "Donor"("active");

-- CreateIndex
CREATE INDEX "Donor_sortOrder_idx" ON "Donor"("sortOrder");

-- CreateIndex
CREATE INDEX "Project_administrativeAreaId_idx" ON "Project"("administrativeAreaId");

-- CreateIndex
CREATE INDEX "Project_donorId_idx" ON "Project"("donorId");

-- CreateIndex
CREATE INDEX "Project_countryCode_idx" ON "Project"("countryCode");

-- CreateIndex
CREATE INDEX "Project_sectorKey_idx" ON "Project"("sectorKey");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_startDate_idx" ON "Project"("startDate");

-- CreateIndex
CREATE INDEX "Project_endDate_idx" ON "Project"("endDate");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_administrativeAreaId_fkey" FOREIGN KEY ("administrativeAreaId") REFERENCES "AdministrativeArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "Donor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdministrativeArea" ADD CONSTRAINT "AdministrativeArea_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "ReferenceCountry"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
