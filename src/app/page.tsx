import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { LiveMatchCard } from '@/components/live-match-card'
import { Countdown } from '@/components/countdown'

export const revalidate = 60

async function getFeaturedMatch() {
  const live = await prisma.match.findFirst({
    where: { status: 'LIVE' },
    orderBy: { kickoff: 'asc' },
  })
  if (live) return live
  return prisma.match.findFirst({
    where: { status: 'SCHEDULED', kickoff: { gt: new Date() } },
    orderBy: { kickoff: 'asc' },
  })
}

export default async function HomePage() {
  const [match, user] = await Promise.all([getFeaturedMatch(), getCurrentUser()])
  const timezone = user?.timezone ?? 'Europe/Bucharest'

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-white">
        World Cup 2026 <span className="text-[#C9A84C]">Predictions</span>
      </h1>
      {match ? (
        <>
          <LiveMatchCard
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
        </>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center text-white/50">
          No matches scheduled yet. Check back soon.
        </div>
      )}
    </div>
  )
}
