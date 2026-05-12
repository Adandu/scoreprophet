'use client'

import { useActionState } from 'react'
import Image from 'next/image'
import { savePrediction, saveKnockoutAdvance } from '@/actions/predictions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type PredictionType = 'SINGLE_OUTCOME' | 'DOUBLE_CHANCE' | 'EXACT_SCORE'

interface ExistingPrediction {
  id: number
  type: PredictionType
  value: string
}

interface Props {
  matchId: number
  homeTeam: string
  awayTeam: string
  homeTeamCrest: string
  awayTeamCrest: string
  existing: ExistingPrediction[]
  isKnockout: boolean
  existingAdvanceTeam?: string
}

const SINGLE_OPTS = ['1', 'X', '2']
const DOUBLE_OPTS = ['1X', 'X2', '12']

export function PredictionForm({ matchId, homeTeam, awayTeam, homeTeamCrest, awayTeamCrest, existing, isKnockout, existingAdvanceTeam }: Props) {
  const [state, formAction, pending] = useActionState(savePrediction, null)

  const hasSingle = existing.some((p) => p.type === 'SINGLE_OUTCOME')
  const hasDouble = existing.some((p) => p.type === 'DOUBLE_CHANCE')
  const hasExact = existing.some((p) => p.type === 'EXACT_SCORE')

  return (
    <div className="mt-3 space-y-3 text-center">
      {state?.error && <p className="text-xs text-red-400">{state.error}</p>}

      {/* Single Outcome */}
      {!hasDouble && (
        <div>
          <p className="text-xs text-white/50 mb-1">Match result (3 pts){hasSingle && ' ✓'}</p>
          <div className="flex justify-center gap-2">
            {SINGLE_OPTS.map((opt) => {
              const active = existing.find((p) => p.type === 'SINGLE_OUTCOME')?.value === opt
              return (
                <form key={opt} action={formAction}>
                  <input type="hidden" name="matchId" value={matchId} />
                  <input type="hidden" name="type" value="SINGLE_OUTCOME" />
                  <input type="hidden" name="value" value={opt} />
                  <Button type="submit" size="sm" disabled={pending}
                    variant={active ? 'default' : 'outline'}
                    className={active ? 'bg-green-600 text-white border-0' : 'border-white/20 text-white/70 bg-transparent hover:bg-white/10'}>
                    {opt}
                  </Button>
                </form>
              )
            })}
          </div>
        </div>
      )}

      {/* Double Chance */}
      {!hasSingle && (
        <div>
          <p className="text-xs text-white/50 mb-1">Double chance (1 pt){hasDouble && ' ✓'}</p>
          <div className="flex justify-center gap-2">
            {DOUBLE_OPTS.map((opt) => {
              const active = existing.find((p) => p.type === 'DOUBLE_CHANCE')?.value === opt
              return (
                <form key={opt} action={formAction}>
                  <input type="hidden" name="matchId" value={matchId} />
                  <input type="hidden" name="type" value="DOUBLE_CHANCE" />
                  <input type="hidden" name="value" value={opt} />
                  <Button type="submit" size="sm" disabled={pending}
                    variant={active ? 'default' : 'outline'}
                    className={active ? 'bg-blue-600 text-white border-0' : 'border-white/20 text-white/70 bg-transparent hover:bg-white/10'}>
                    {opt}
                  </Button>
                </form>
              )
            })}
          </div>
        </div>
      )}

      {/* Exact Score */}
      <div>
        <p className="text-xs text-white/50 mb-1">Exact score (5 pts){hasExact && ' ✓'}</p>
        <form action={formAction} className="flex justify-center gap-2">
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="type" value="EXACT_SCORE" />
          <Input name="value" placeholder="e.g. 2-1"
            defaultValue={existing.find((p) => p.type === 'EXACT_SCORE')?.value ?? ''}
            className="w-24 bg-white/10 text-white border-white/20 text-sm h-8" />
          <Button type="submit" size="sm" disabled={pending}
            className={`h-8 ${hasExact ? 'bg-yellow-600' : 'bg-[#C9A84C]'} text-[#0A1628] font-semibold hover:opacity-90`}>
            {hasExact ? 'Update' : 'Save'}
          </Button>
        </form>
      </div>

      {/* Knockout Advance */}
      {isKnockout && (
        <KnockoutAdvanceForm
          matchId={matchId}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          homeTeamCrest={homeTeamCrest}
          awayTeamCrest={awayTeamCrest}
          existingTeam={existingAdvanceTeam}
        />
      )}
    </div>
  )
}

function KnockoutAdvanceForm({
  matchId,
  homeTeam,
  awayTeam,
  homeTeamCrest,
  awayTeamCrest,
  existingTeam,
}: {
  matchId: number
  homeTeam: string
  awayTeam: string
  homeTeamCrest: string
  awayTeamCrest: string
  existingTeam?: string
}) {
  const [state, formAction, pending] = useActionState(saveKnockoutAdvance, null)
  return (
    <div>
      <p className="text-xs text-white/50 mb-1">Who advances? (1 bonus pt){existingTeam && ` ✓ ${existingTeam}`}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {[
          { name: homeTeam, crest: homeTeamCrest },
          { name: awayTeam, crest: awayTeamCrest },
        ].map((team) => {
          const active = existingTeam === team.name
          return (
            <form key={team.name} action={formAction}>
              <input type="hidden" name="matchId" value={matchId} />
              <input type="hidden" name="predictedTeam" value={team.name} />
              <Button
                type="submit"
                size="sm"
                disabled={pending}
                variant={active ? 'default' : 'outline'}
                className={active ? 'bg-purple-600 text-white border-0' : 'border-white/20 text-white/70 bg-transparent hover:bg-white/10'}
              >
                {team.crest && <Image src={team.crest} alt="" width={18} height={18} className="max-h-4 w-auto object-contain" />}
                {team.name}
              </Button>
            </form>
          )
        })}
      </div>
      {state?.error && <p className="text-xs text-red-400 mt-1">{state.error}</p>}
    </div>
  )
}
