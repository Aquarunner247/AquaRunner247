-- Preset service messages a technician picks from at completion; the chosen text goes into the
-- customer's service-summary email.
CREATE TABLE "ServiceMessageTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceMessageTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServiceMessageTemplate_organizationId_active_idx" ON "ServiceMessageTemplate"("organizationId", "active");

ALTER TABLE "ServiceMessageTemplate" ADD CONSTRAINT "ServiceMessageTemplate_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The message actually sent, snapshotted as text: editing a template later must not rewrite what
-- a customer was already told. Null for visits completed before this existed.
ALTER TABLE "ServiceVisit" ADD COLUMN     "serviceMessage" TEXT;

-- Seed every EXISTING organization with the same three defaults a new one now gets
-- (lib/default-service-messages.ts). {{orgName}} is interpolated at send time, so these rows stay
-- correct if an organization renames itself. Skips any org that somehow already has messages.
INSERT INTO "ServiceMessageTemplate" ("id", "organizationId", "label", "body", "sortOrder", "active", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    o."id",
    d."label",
    d."body",
    d."sortOrder",
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Organization" o
CROSS JOIN (
    VALUES
        ('Standard — service completed',
         'Thank you for your continued trust in {{orgName}} to keep your pools clean and safe. Your service for the day has been completed.',
         0),
        ('High wind — limited skimming',
         'Service completed. Winds were high today, so skimming was limited — debris was blowing back in as fast as it came out. Chemicals were balanced and equipment checked as normal.',
         1),
        ('Unsafe weather — no pole in the water',
         'Service completed where it was safe to do so. Storms made it unsafe to put a pole in the water, so skimming and brushing were skipped. Chemicals were balanced and all equipment checked.',
         2)
) AS d("label", "body", "sortOrder")
WHERE NOT EXISTS (
    SELECT 1 FROM "ServiceMessageTemplate" existing WHERE existing."organizationId" = o."id"
);
