-- AlterTable
ALTER TABLE "AdministrativeArea" ADD COLUMN     "estimatedPopulation" INTEGER,
ADD COLUMN     "populationNotes" TEXT,
ADD COLUMN     "populationSource" TEXT,
ADD COLUMN     "populationSourceUrl" TEXT,
ADD COLUMN     "populationYear" INTEGER;
