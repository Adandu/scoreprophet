ALTER TABLE "Match" ADD COLUMN "scoreDuration" TEXT NOT NULL DEFAULT 'REGULAR';
ALTER TABLE "Match" ADD COLUMN "regularTimeHomeScore" INTEGER;
ALTER TABLE "Match" ADD COLUMN "regularTimeAwayScore" INTEGER;
ALTER TABLE "Match" ADD COLUMN "fullTimeHomeScore" INTEGER;
ALTER TABLE "Match" ADD COLUMN "fullTimeAwayScore" INTEGER;
ALTER TABLE "Match" ADD COLUMN "extraTimeHomeScore" INTEGER;
ALTER TABLE "Match" ADD COLUMN "extraTimeAwayScore" INTEGER;
ALTER TABLE "Match" ADD COLUMN "penaltiesHomeScore" INTEGER;
ALTER TABLE "Match" ADD COLUMN "penaltiesAwayScore" INTEGER;
