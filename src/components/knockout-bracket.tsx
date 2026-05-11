'use client'

import Image from 'next/image'
import { formatMatchTime } from '@/lib/format-date'

type Stage = 'ROUND_OF_32' | 'ROUND_OF_16' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'THIRD_PLACE' | 'FINAL'

interface BracketMatch {
  id: number
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
  winnerTeam: string | null
  status: string
  stage: string
  kickoff: string
}

const ROUND_LABELS: Record<Stage, string> = {
  ROUND_OF_32: 'Round of 32',
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINAL: 'Quarter-Finals',
  SEMI_FINAL: 'Semi-Finals',
  THIRD_PLACE: '3rd Place',
  FINAL: 'Final',
}

const MAIN_ROUNDS: Stage[] = ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL']

export function KnockoutBracket({ matches, timezone }: { matches: BracketMatch[]; timezone: string }) {
  const byStage = MAIN_ROUNDS.reduce<Record<Stage, BracketMatch[]>>((acc, stage) => {
    acc[stage] = matches.filter((match) => match.stage === stage).sort(byKickoff)
    return acc
  }, {} as Record<Stage, BracketMatch[]>)

  const final = matches.find((match) => match.stage === 'FINAL')
  const thirdPlace = matches.find((match) => match.stage === 'THIRD_PLACE')

  return (
    <div className="space-y-6">
      <p className="text-xs text-white/35 md:hidden">Scroll sideways to view the full bracket</p>
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex min-w-[1180px] items-center justify-start gap-4">
          {MAIN_ROUNDS.map((stage) => (
            <RoundColumn key={`left-${stage}`} title={ROUND_LABELS[stage]} matches={leftHalf(byStage[stage])} timezone={timezone} />
          ))}

          <div className="flex min-w-[170px] flex-col items-center justify-center gap-3 px-2">
            <Image src="/trophy.png" alt="World Cup trophy" width={112} height={112} className="h-28 w-auto object-contain drop-shadow-lg" />
            <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A84C]">World Cup 2026</p>
            {final ? <MatchSlot match={final} timezone={timezone} compact /> : <EmptySlot label="Final" />}
          </div>

          {[...MAIN_ROUNDS].reverse().map((stage) => (
            <RoundColumn key={`right-${stage}`} title={ROUND_LABELS[stage]} matches={rightHalf(byStage[stage])} timezone={timezone} />
          ))}
        </div>
      </div>

      {thirdPlace && (
        <section className="mx-auto max-w-sm">
          <h2 className="mb-3 text-center text-sm font-semibold uppercase tracking-wide text-[#C9A84C]">3rd Place Play-off</h2>
          <MatchSlot match={thirdPlace} timezone={timezone} />
        </section>
      )}
    </div>
  )
}

function RoundColumn({ title, matches, timezone }: { title: string; matches: BracketMatch[]; timezone: string }) {
  return (
    <section className="flex min-w-[140px] flex-col gap-3">
      <h2 className="text-center text-xs font-semibold uppercase tracking-wide text-white/45">{title}</h2>
      <div className="flex flex-col justify-center gap-3">
        {matches.length > 0 ? matches.map((match) => <MatchSlot key={match.id} match={match} timezone={timezone} />) : <EmptySlot label={title} />}
      </div>
    </section>
  )
}

function MatchSlot({ match, timezone, compact = false }: { match: BracketMatch; timezone: string; compact?: boolean }) {
  const homeWon = match.status === 'FINISHED' && match.winnerTeam === match.homeTeam
  const awayWon = match.status === 'FINISHED' && match.winnerTeam === match.awayTeam

  return (
    <div className={`rounded-lg border border-white/10 bg-[#0A1628]/80 p-2 ${compact ? 'w-40' : 'w-36'}`}>
      <TeamLine team={match.homeTeam} score={match.homeScore} winner={homeWon} />
      <TeamLine team={match.awayTeam} score={match.awayScore} winner={awayWon} />
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/10 pt-2 text-[10px] text-white/35">
        <span>{formatMatchTime(match.kickoff, timezone)}</span>
        {match.status === 'LIVE' && <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />}
      </div>
    </div>
  )
}

function TeamLine({ team, score, winner }: { team: string; score: number | null; winner: boolean }) {
  const pending = team === 'TBD' || team.startsWith('Winner ') || team.startsWith('Runner ')
  return (
    <div className={`flex items-center justify-between gap-2 py-0.5 text-xs ${winner ? 'font-bold text-[#C9A84C]' : pending ? 'text-white/35' : 'text-white/80'}`}>
      <span className="truncate">{team}</span>
      <span className="tabular-nums">{score ?? ''}</span>
    </div>
  )
}

function EmptySlot({ label }: { label: string }) {
  return (
    <div className="w-36 rounded-lg border border-dashed border-white/10 bg-white/[0.03] p-3 text-center text-xs text-white/25">
      {label}
    </div>
  )
}

function byKickoff(a: BracketMatch, b: BracketMatch) {
  return new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
}

function leftHalf(matches: BracketMatch[]) {
  return matches.slice(0, Math.ceil(matches.length / 2))
}

function rightHalf(matches: BracketMatch[]) {
  return matches.slice(Math.ceil(matches.length / 2))
}
