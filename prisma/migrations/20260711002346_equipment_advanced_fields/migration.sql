
-- CreateEnum
CREATE TYPE "FilterMedia" AS ENUM ('SAND', 'CARTRIDGE', 'DE');

-- CreateEnum
CREATE TYPE "EquipmentPurpose" AS ENUM ('FILTRATION', 'JETS');

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "filterMedia" "FilterMedia",
ADD COLUMN     "flowRateGpm" DECIMAL(10,2),
ADD COLUMN     "purpose" "EquipmentPurpose",
ADD COLUMN     "quantity" INTEGER;

