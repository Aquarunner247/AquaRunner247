-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "asmeCertified" BOOLEAN,
ADD COLUMN     "btu" INTEGER,
ADD COLUMN     "equalizerAbandoned" BOOLEAN,
ADD COLUMN     "horsepower" DECIMAL(6,2),
ADD COLUMN     "manufacturedSump" BOOLEAN,
ADD COLUMN     "vgbaYear" INTEGER,
ADD COLUMN     "voltage" TEXT;
