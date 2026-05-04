-- Adds in-database storage for team-member photos.
--
-- Background: the CMS previously asked users to paste an external image
-- URL. This often left the public /team page rendering an empty grey
-- block. The CMS now accepts JPEG / PNG uploads which are validated on
-- the server and stored here as raw bytes + MIME type. The existing
-- TeamMember.photoUrl column is retained so legacy rows keep rendering
-- while new rows populate photoData instead.
--
-- Additive-only: new nullable columns, no data migration required.

ALTER TABLE "TeamMember" ADD COLUMN "photoData" BYTEA;
ALTER TABLE "TeamMember" ADD COLUMN "photoMimeType" TEXT;