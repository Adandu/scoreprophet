import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { fetchAllMatches } from '../src/lib/football-api'

// Load env vars for DATABASE_URL and FOOTBALL_API_KEY
import { config } from 'dotenv'
config()

const dbUrl = (process.env.DATABASE_URL ?? 'file:./dev.db').replace(/^file:/, '')
const adapter = new PrismaBetterSqlite3({ url: dbUrl })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('[seed] Syncing WC2026 matches from football-data.org...')
  let matches
  try {
    matches = await fetchAllMatches()
  } catch (err) {
    console.warn('[seed] API unavailable, skipping match sync:', err)
    return
  }
  for (const m of matches) {
    await prisma.match.upsert({
      where: { externalId: m.externalId },
      update: { status: m.status, homeScore: m.homeScore, awayScore: m.awayScore, homeTeamCrest: m.homeTeamCrest, awayTeamCrest: m.awayTeamCrest },
      create: { externalId: m.externalId, homeTeam: m.homeTeam, awayTeam: m.awayTeam, homeTeamCrest: m.homeTeamCrest, awayTeamCrest: m.awayTeamCrest, stage: m.stage, kickoff: m.kickoff, status: m.status, homeScore: m.homeScore, awayScore: m.awayScore },
    })
  }
  console.log(`[seed] Synced ${matches.length} matches.`)
  await prisma.$disconnect()
}

main().catch((e) => { console.error('[seed] Fatal error:', e); process.exit(1) })
