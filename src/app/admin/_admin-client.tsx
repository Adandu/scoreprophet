'use client'

import { useActionState } from 'react'
import { overrideMatchScore, recalculateAllPoints, removeUser, syncMatchesFromApi } from '@/actions/admin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

const STAGE_LABELS: Record<string, string> = {
  GROUP: 'Group Stage',
  ROUND_OF_32: 'Round of 32',
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINAL: 'Quarter-Finals',
  SEMI_FINAL: 'Semi-Finals',
  THIRD_PLACE: 'Third Place',
  FINAL: 'Final',
}

interface Match {
  id: number
  homeTeam: string
  awayTeam: string
  kickoff: string
  status: string
  homeScore: number | null
  awayScore: number | null
  stage: string
  adminOverride: boolean
}

interface User {
  id: number
  username: string
  isAdmin: boolean
}

export function AdminClient({ matches, users, timezone }: { matches: Match[]; users: User[]; timezone: string }) {
  const [syncState, syncAction, syncPending] = useActionState(syncMatchesFromApi, null)
  const [recalcState, recalcAction, recalcPending] = useActionState(recalculateAllPoints, null)

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold text-white">Admin Panel</h1>

      {/* Actions */}
      <section className="flex gap-3 flex-wrap">
        <form action={syncAction}>
          <Button type="submit" disabled={syncPending} className="bg-blue-600 hover:bg-blue-700 text-white">
            {syncPending ? 'Syncing…' : 'Sync Matches from API'}
          </Button>
        </form>
        <form action={recalcAction}>
          <Button type="submit" disabled={recalcPending} variant="outline" className="border-white/20 text-white hover:bg-white/10 bg-transparent">
            {recalcPending ? 'Recalculating…' : 'Recalculate All Points'}
          </Button>
        </form>
        {syncState?.error && <p className="text-sm text-red-400 self-center">{syncState.error}</p>}
        {syncState?.success && <p className="text-sm text-green-400 self-center">Synced {(syncState as { synced: number }).synced} matches</p>}
        {recalcState?.success && <p className="text-sm text-green-400 self-center">Recalculated {(recalcState as { count: number }).count} matches</p>}
      </section>

      {/* Override Scores */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-[#C9A84C]">Override Match Score</h2>
        <div className="space-y-3">
          {matches.map((match) => (
            <MatchOverrideRow key={match.id} match={match} timezone={timezone} />
          ))}
        </div>
      </section>

      {/* Users */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-[#C9A84C]">Users</h2>
        <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-4 py-2 text-left text-white/40 font-normal">Username</th>
                <th className="px-4 py-2 text-left text-white/40 font-normal">Role</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <UserRow key={user.id} user={user} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function MatchOverrideRow({ match, timezone }: { match: Match; timezone: string }) {
  const [state, formAction, pending] = useActionState(overrideMatchScore, null)

  return (
    <form action={formAction} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-2 flex-wrap">
      <input type="hidden" name="matchId" value={match.id} />
      <span className="text-sm text-white flex-1 min-w-0">
        <span className="text-white/30 text-xs mr-2">{STAGE_LABELS[match.stage] ?? match.stage}</span>
        {match.homeTeam} vs {match.awayTeam}
        <span className="ml-2 text-white/30 text-xs">{new Intl.DateTimeFormat('en-GB', { timeZone: timezone, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(match.kickoff))}</span>
        {match.adminOverride && <Badge className="ml-2 bg-orange-600/20 text-orange-400 text-xs">overridden</Badge>}
      </span>
      <Input name="homeScore" type="number" min="0" max="20" defaultValue={match.homeScore ?? ''} placeholder="H" className="w-14 bg-white/10 text-white border-white/20 text-sm h-7 text-center" />
      <span className="text-white/40">–</span>
      <Input name="awayScore" type="number" min="0" max="20" defaultValue={match.awayScore ?? ''} placeholder="A" className="w-14 bg-white/10 text-white border-white/20 text-sm h-7 text-center" />
      {match.stage !== 'GROUP' && (
        <Input name="winnerTeam" placeholder="Advancing team" className="w-36 bg-white/10 text-white border-white/20 text-sm h-7" />
      )}
      <Button type="submit" size="sm" disabled={pending} className="h-7 bg-[#C9A84C] text-[#0A1628] hover:bg-[#C9A84C]/90 text-xs font-semibold">
        {pending ? '…' : 'Set'}
      </Button>
      {state?.error && <span className="text-xs text-red-400">{state.error}</span>}
      {state?.success && <span className="text-xs text-green-400">✓</span>}
    </form>
  )
}

function UserRow({ user }: { user: User }) {
  const [, formAction, pending] = useActionState(removeUser, null)
  return (
    <tr className="border-b border-white/5 last:border-0">
      <td className="px-4 py-2 text-white">{user.username}</td>
      <td className="px-4 py-2">
        {user.isAdmin ? (
          <Badge className="bg-[#C9A84C] text-[#0A1628]">Admin</Badge>
        ) : (
          <span className="text-white/40">User</span>
        )}
      </td>
      <td className="px-4 py-2 text-right">
        {!user.isAdmin && (
          <form action={formAction}>
            <input type="hidden" name="userId" value={user.id} />
            <Button type="submit" size="sm" variant="outline" disabled={pending}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10 bg-transparent text-xs">
              Remove
            </Button>
          </form>
        )}
      </td>
    </tr>
  )
}
