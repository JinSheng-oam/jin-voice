ALTER TABLE "SiteAppearance" ADD COLUMN "backgroundMediaType" TEXT NOT NULL DEFAULT 'image';
ALTER TABLE "SiteAppearance" ADD COLUMN "backgroundMediaId" TEXT;
ALTER TABLE "SiteAppearance" ADD COLUMN "backgroundMediaLibrary" TEXT NOT NULL DEFAULT '[]';
