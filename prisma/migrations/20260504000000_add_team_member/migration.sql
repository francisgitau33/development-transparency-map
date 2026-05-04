-- Adds the TeamMember model for the CMS-managed public "Our Team" page.
--
-- Purpose: lets SYSTEM_OWNERs add, edit, publish / unpublish, and remove
-- team members shown on /team. Mirrors the CMS-About pattern (a single
-- Prisma model with an authenticated PUT endpoint), scaled up to a
-- collection with ordering and active-flag semantics.
--
-- Additive-only: brand-new table, no touching of existing rows. Safe to
-- deploy before the new server code ships, and safe to roll back by
-- simply not calling the new endpoints.

CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "bio" TEXT,
    "photoUrl" TEXT,
    "linkedinUrl" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TeamMember_active_displayOrder_idx" ON "TeamMember"("active", "displayOrder");
