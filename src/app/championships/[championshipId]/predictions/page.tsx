import { prisma } from '@/lib/db'
import { requireChampionshipAccess } from '@/lib/championships'
import { PredictionForm } from '@/components/prediction-form'
import { ResetButton } from '@/components/reset-button'
import { Badge } from '@/components/ui/badge'
import { formatMatchTime } from '@/lib/format-date'
import { ChampionshipPageNav } from '@/components/championship-page-nav'

type Stage = 'GROUP' | 'ROUND_OF_32' | 'ROUND_OF_16' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'THIRD_PLACE' | 'FINAL'

const STAGE_LABELS: Record<Stage, string> = {
  GROUP: 'Group Stage',
  ROUND_OF_32: 'Round of 32',
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINAL: 'Quarter-Finals',
  SEMI_FINAL: 'Semi-Finals',
  THIRD_PLACE: 'Third Place',
  FINAL: 'Final',
}

const STAGE_ORDER: Stage[] = ['GROUP', 'ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'THIRD_PLACE', 'FINAL']

export default async function ChampionshipPredictionsPage({ params }: { params: Promise<{ championshipId: string }> }) {
  const { championshipId: rawId } = await params
  const championshipId = parseInt(rawId, 10)
  const { session, championship } = await requireChampionshipAccess(championshipId)
  const timezone = session.timezone ?? 'Europe/Bucharest'

  const [matches, userPredictions, userAdvances] = await Promise.all([
    prisma.match.findMany({
      where: { status: { not: 'FINISHED' } },
      orderBy: { kickoff: 'asc' },
    }),
    prisma.prediction.findMany({ where: { userId: session.userId } }),
    prisma.knockoutAdvance.findMany({ where: { userId: session.userId } }),
  ])

  const predByMatch = userPredictions.reduce<Record<number, typeof userPredictions>>((acc, p) => {
    acc[p.matchId] = acc[p.matchId] ?? []
    acc[p.matchId].push(p)
    return acc
  }, {})

  const advanceByMatch = userAdvances.reduce<Record<number, string>>((acc, a) => {
    acc[a.matchId] = a.predictedTeam
    return acc
  }, {})

  const grouped = STAGE_ORDER.reduce<Record<Stage, typeof matches>>((acc, stage) => {
    acc[stage] = matches.filter((m) => m.stage === stage)
    return acc
  }, {} as Record<Stage, typeof matches>)

  const now = new Date()

  return (
    <div className="space-y-8">
      <ChampionshipPageNav championshipId={championship.id} name={championship.name} />
      <h2 className="text-xl font-bold text-white">Predictions</h2>
      {STAGE_ORDER.map((stage) => {
        const stageMatches = grouped[stage]
        if (!stageMatches.length) return null
        return (
          <section key={stage}>
            <h3 className="mb-3 text-lg font-semibold text-[#C9A84C]">{STAGE_LABELS[stage]}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {stageMatches.map((match) => {
                const locked = match.kickoff <= now
                const existing = predByMatch[match.id] ?? []
                return (
                  <div key={match.id} className={`rounded-xl border p-4 ${locked ? 'border-white/5 bg-white/3 opacity-60' : 'border-white/10 bg-white/5'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-white/40">{formatMatchTime(match.kickoff, timezone)}</span>
                      {locked && <Badge variant="outline" className="text-xs border-white/20 text-white/40">Locked</Badge>}
                    </div>
                    <div className="flex items-center justify-between font-semibold text-white">
                      <span>{match.homeTeam}</span>
                      <span className="text-white/30">vs</span>
                      <span>{match.awayTeam}</span>
                    </div>
                    {!locked && (
                      <>
                        <PredictionForm
                          matchId={match.id}
                          homeTeam={match.homeTeam}
                          awayTeam={match.awayTeam}
                          existing={existing}
                          isKnockout={match.stage !== 'GROUP'}
                          existingAdvanceTeam={advanceByMatch[match.id]}
                        />
                        {(existing.length > 0 || advanceByMatch[match.id]) && <ResetButton matchId={match.id} />}
                      </>
                    )}
                    {locked && existing.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {existing.map((p) => (
                          <Badge key={p.id} className="bg-white/10 text-white/60 text-xs">{p.value}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
