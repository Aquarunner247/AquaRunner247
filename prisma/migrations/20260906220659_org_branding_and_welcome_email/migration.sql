-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "brandingHeaderColor" TEXT,
ADD COLUMN     "brandingLogoUrl" TEXT,
ADD COLUMN     "brandingPrimaryColor" TEXT,
ADD COLUMN     "brandingUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "brandingUpdatedBy" TEXT,
ADD COLUMN     "welcomeEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "welcomeEmailIntroText" VARCHAR(500),
ADD COLUMN     "welcomeEmailSupportEmail" TEXT,
ADD COLUMN     "welcomeEmailSupportPhone" TEXT;

-- CreateTable
CREATE TABLE "WelcomeEmailSend" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,

    CONSTRAINT "WelcomeEmailSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WelcomeEmailSend_organizationId_customerId_idx" ON "WelcomeEmailSend"("organizationId", "customerId");

-- CreateIndex
CREATE INDEX "WelcomeEmailSend_toEmail_idx" ON "WelcomeEmailSend"("toEmail");

-- AddForeignKey
ALTER TABLE "WelcomeEmailSend" ADD CONSTRAINT "WelcomeEmailSend_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WelcomeEmailSend" ADD CONSTRAINT "WelcomeEmailSend_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
