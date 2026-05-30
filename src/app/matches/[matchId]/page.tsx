import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { LiveMatchPanel } from '@/components/live/live-match-panel'
import { fetchLiveMatchDetails, type NormalizedMatch, type LiveMatchDetails } from '@/lib/football-api'
import { canCallMatchDetailApi } from '@/lib/rate-limiter'
import type { Stage } from '@/lib/types'

export const revalidate = 0

export default async function MatchDetailPage({ params }: { params: Promise<{ matchId: string }> }) {
  await requireAuth()
  const { matchId } = await params

  const match = await prisma.match.findUnique({ where: { externalId: matchId } })
  if (!match || match.status !== 'FINISHED') notFound()

  const hasCachedData = !!match.detailJson
  let prefetchedDetails: LiveMatchDetails | undefined

  // Call API if under rate limit OR if there's no cached data yet
  if (!hasCachedData || canCallMatchDetailApi()) {
    try {
      prefetchedDetails = await fetchLiveMatchDetails(match.externalId)
      // Only cache if the response looks complete (has goals for matches that should have them)
      const hasGoals = prefetchedDetails.goals.length > 0
      const expectsGoals = (match.homeScore ?? 0) + (match.awayScore ?? 0) > 0
      if (hasGoals || !expectsGoals) {
        await prisma.match.update({
          where: { id: match.id },
          data: { detailJson: JSON.stringify(prefetchedDetails) },
        })
      }
    } catch {
      // API failed — fall back to cache
      if (match.detailJson) {
        try { prefetchedDetails = JSON.parse(match.detailJson) } catch { /* corrupted */ }
      }
    }
  } else {
    // Rate limited — serve from cache
    try { prefetchedDetails = JSON.parse(match.detailJson) } catch { /* corrupted */ }
  }

  const liveMatch: NormalizedMatch = {
    externalId: match.externalId,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    homeTeamCrest: match.homeTeamCrest,
    awayTeamCrest: match.awayTeamCrest,
    stage: match.stage as Stage,
    group: match.group,
    kickoff: match.kickoff,
    status: 'FINISHED',
    scoreDuration: match.scoreDuration as 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT',
    regularTimeHomeScore: match.regularTimeHomeScore,
    regularTimeAwayScore: match.regularTimeAwayScore,
    fullTimeHomeScore: match.fullTimeHomeScore,
    fullTimeAwayScore: match.fullTimeAwayScore,
    extraTimeHomeScore: match.extraTimeHomeScore,
    extraTimeAwayScore: match.extraTimeAwayScore,
    penaltiesHomeScore: match.penaltiesHomeScore,
    penaltiesAwayScore: match.penaltiesAwayScore,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    winnerTeam: match.winnerTeam,
  }

  return (
    <div className="space-y-6">
      <Link href="javascript:history.back()" className="text-sm text-white/40 hover:text-white/70 transition-colors">
        ← Back
      </Link>
      <LiveMatchPanel liveMatch={liveMatch} prefetchedDetails={prefetchedDetails} />
    </div>
  )
}
