/*
  Warnings:

  - Added the required column `championshipId` to the `KnockoutAdvance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `championshipId` to the `Prediction` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Championship" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "doubleChanceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Championship" ("createdAt", "description", "id", "isActive", "name", "updatedAt") SELECT "createdAt", "description", "id", "isActive", "name", "updatedAt" FROM "Championship";
DROP TABLE "Championship";
ALTER TABLE "new_Championship" RENAME TO "Championship";
CREATE UNIQUE INDEX "Championship_name_key" ON "Championship"("name");
CREATE TABLE "new_KnockoutAdvance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "matchId" INTEGER NOT NULL,
    "championshipId" INTEGER NOT NULL,
    "predictedTeam" TEXT NOT NULL,
    "pointsAwarded" INTEGER,
    CONSTRAINT "KnockoutAdvance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KnockoutAdvance_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_KnockoutAdvance" ("id", "matchId", "pointsAwarded", "predictedTeam", "userId") SELECT "id", "matchId", "pointsAwarded", "predictedTeam", "userId" FROM "KnockoutAdvance";
DROP TABLE "KnockoutAdvance";
ALTER TABLE "new_KnockoutAdvance" RENAME TO "KnockoutAdvance";
CREATE UNIQUE INDEX "KnockoutAdvance_userId_matchId_championshipId_key" ON "KnockoutAdvance"("userId", "matchId", "championshipId");
CREATE TABLE "new_Prediction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "matchId" INTEGER NOT NULL,
    "championshipId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "pointsAwarded" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Prediction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Prediction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Prediction" ("createdAt", "id", "matchId", "pointsAwarded", "type", "userId", "value") SELECT "createdAt", "id", "matchId", "pointsAwarded", "type", "userId", "value" FROM "Prediction";
DROP TABLE "Prediction";
ALTER TABLE "new_Prediction" RENAME TO "Prediction";
CREATE UNIQUE INDEX "Prediction_userId_matchId_type_championshipId_key" ON "Prediction"("userId", "matchId", "type", "championshipId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
