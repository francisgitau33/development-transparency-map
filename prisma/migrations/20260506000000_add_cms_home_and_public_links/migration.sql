-- Adds CMS management tables for the public Home page and the
-- footer-level public links (social media + contact email).
--
-- Both tables are singleton-style: the API keeps exactly one row and
-- always upserts against the first/most-recently-updated record. The
-- public pages fall back to hardcoded defaults if these tables are
-- missing or empty, so this migration is safe to apply without any
-- data backfill.
--
-- Additive-only: two new tables + two FKs to User("id"). No existing
-- rows are rewritten.

CREATE TABLE "CmsHome" (
    "id" TEXT NOT NULL,
    "heroTitle" TEXT NOT NULL,
    "heroSubtitle" TEXT NOT NULL,
    "heroDescription" TEXT,
    "primaryCtaLabel" TEXT,
    "primaryCtaHref" TEXT,
    "secondaryCtaLabel" TEXT,
    "secondaryCtaHref" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "CmsHome_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CmsPublicLinks" (
    "id" TEXT NOT NULL,
    "linkedinUrl" TEXT,
    "mediumUrl" TEXT,
    "contactEmail" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "CmsPublicLinks_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CmsHome"
    ADD CONSTRAINT "CmsHome_updatedByUserId_fkey"
    FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CmsPublicLinks"
    ADD CONSTRAINT "CmsPublicLinks_updatedByUserId_fkey"
    FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;