-- CreateTable
CREATE TABLE IF NOT EXISTS "Championship" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ChampionshipMember" (
    "championshipId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("championshipId", "userId"),
    CONSTRAINT "ChampionshipMember_championshipId_fkey" FOREIGN KEY ("championshipId") REFERENCES "Championship" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChampionshipMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Championship_name_key" ON "Championship"("name");
