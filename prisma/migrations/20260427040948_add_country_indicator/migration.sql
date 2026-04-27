-- CreateTable
CREATE TABLE "CountryIndicator" (
    "id" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "indicatorKey" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "value" DOUBLE PRECISION,
    "rank" INTEGER,
    "unit" TEXT,
    "source" TEXT,
    "sourceUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountryIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CountryIndicator_countryCode_idx" ON "CountryIndicator"("countryCode");

-- CreateIndex
CREATE INDEX "CountryIndicator_indicatorKey_idx" ON "CountryIndicator"("indicatorKey");

-- CreateIndex
CREATE INDEX "CountryIndicator_year_idx" ON "CountryIndicator"("year");

-- CreateIndex
CREATE UNIQUE INDEX "CountryIndicator_countryCode_indicatorKey_year_key" ON "CountryIndicator"("countryCode", "indicatorKey", "year");

-- AddForeignKey
ALTER TABLE "CountryIndicator" ADD CONSTRAINT "CountryIndicator_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "ReferenceCountry"("code") ON DELETE CASCADE ON UPDATE CASCADE;
