-- Per-body-of-water inspector contact + last inspection date, filled in post-signup.
ALTER TABLE "BodyOfWater" ADD COLUMN "inspectorName" TEXT;
ALTER TABLE "BodyOfWater" ADD COLUMN "inspectorPhone" TEXT;
ALTER TABLE "BodyOfWater" ADD COLUMN "inspectorEmail" TEXT;
ALTER TABLE "BodyOfWater" ADD COLUMN "lastInspectionDate" DATE;

-- Uploaded inspection report files, one row per file, scoped to a body of water.
CREATE TABLE "InspectionReport" (
    "id" TEXT NOT NULL,
    "bodyOfWaterId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "contentType" TEXT,
    "fileSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InspectionReport_bodyOfWaterId_idx" ON "InspectionReport"("bodyOfWaterId");

ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_bodyOfWaterId_fkey"
    FOREIGN KEY ("bodyOfWaterId") REFERENCES "BodyOfWater"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: new tables don't inherit ENABLE ROW LEVEL SECURITY from the schema-level lockdown --
-- each new table needs it set explicitly, same convention as every other feature this session.
ALTER TABLE "InspectionReport" ENABLE ROW LEVEL SECURITY;
