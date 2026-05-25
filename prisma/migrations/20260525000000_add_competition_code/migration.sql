-- AlterTable
ALTER TABLE "Match" ADD COLUMN "competitionCode" TEXT NOT NULL DEFAULT 'WC';

-- AlterTable
ALTER TABLE "Championship" ADD COLUMN "competitionCode" TEXT NOT NULL DEFAULT 'WC';
