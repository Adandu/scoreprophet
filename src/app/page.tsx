import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { LiveMatchCard } from '@/components/live-match-card'
import { Countdown } from '@/components/countdown'

export const revalidate = 60

async function getFeaturedMatches() {
  const now = new Date()
  const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const upcoming = await prisma.match.findMany({
    where: {
      OR: [
        { status: 'LIVE' },
        { status: 'SCHEDULED', kickoff: { gt: now, lte: next24Hours } },
      ],
    },
    orderBy: { kickoff: 'asc' },
  })

  if (upcoming.length > 0) return upcoming

  const fallback = await prisma.match.findFirst({
    where: { status: 'SCHEDULED', kickoff: { gt: now } },
    orderBy: { kickoff: 'asc' },
  })

  return fallback ? [fallback] : []
}

export default async function HomePage() {
  const [matches, user] = await Promise.all([getFeaturedMatches(), getCurrentUser()])
  const timezone = user?.timezone ?? 'Europe/Bucharest'

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-white">
        World Cup 2026 <span className="text-[#C9A84C]">Predictions</span>
      </h1>
      {matches.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {matches.map((match) => (
            <LiveMatchCard
              key={match.id}
              match={{
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
                homeTeamCrest: match.homeTeamCrest,
                awayTeamCrest: match.awayTeamCrest,
                homeScore: match.homeScore,
                awayScore: match.awayScore,
                status: match.status,
                kickoff: match.kickoff.toISOString(),
              }}
              timezone={timezone}
              countdown={match.status === 'SCHEDULED' ? <Countdown kickoff={match.kickoff.toISOString()} /> : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center text-white/50">
          No matches scheduled yet. Check back soon.
        </div>
      )}
    </div>
  )
}
