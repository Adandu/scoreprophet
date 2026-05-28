-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Team" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "tla" TEXT NOT NULL DEFAULT '',
    "crest" TEXT NOT NULL,
    "areaName" TEXT NOT NULL DEFAULT '',
    "areaCode" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "founded" INTEGER,
    "clubColors" TEXT NOT NULL DEFAULT '',
    "venue" TEXT NOT NULL DEFAULT '',
    "coachName" TEXT NOT NULL DEFAULT '',
    "squadJson" TEXT NOT NULL DEFAULT '[]',
    "staffJson" TEXT NOT NULL DEFAULT '[]',
    "runningCompetitionsJson" TEXT NOT NULL DEFAULT '[]',
    "rawJson" TEXT NOT NULL DEFAULT '{}',
    "wcStatsJson" TEXT NOT NULL DEFAULT '{}'
);
INSERT INTO "new_Team" ("address", "areaCode", "areaName", "clubColors", "coachName", "crest", "externalId", "founded", "id", "name", "rawJson", "runningCompetitionsJson", "shortName", "squadJson", "staffJson", "tla", "venue", "website") SELECT "address", "areaCode", "areaName", "clubColors", "coachName", "crest", "externalId", "founded", "id", "name", "rawJson", "runningCompetitionsJson", "shortName", "squadJson", "staffJson", "tla", "venue", "website" FROM "Team";
DROP TABLE "Team";
ALTER TABLE "new_Team" RENAME TO "Team";
CREATE UNIQUE INDEX "Team_externalId_key" ON "Team"("externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Championship_competitionCode_idx" ON "Championship"("competitionCode");

-- CreateIndex
CREATE INDEX "KnockoutAdvance_matchId_idx" ON "KnockoutAdvance"("matchId");

-- CreateIndex
CREATE INDEX "Match_status_idx" ON "Match"("status");

-- CreateIndex
CREATE INDEX "Match_kickoff_idx" ON "Match"("kickoff");

-- CreateIndex
CREATE INDEX "Match_competitionCode_stage_idx" ON "Match"("competitionCode", "stage");

-- CreateIndex
CREATE INDEX "TournamentWinnerPrediction_championshipId_idx" ON "TournamentWinnerPrediction"("championshipId");
