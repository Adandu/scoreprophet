import Image from 'next/image'
import Link from 'next/link'
import { fetchAllTeams } from '@/lib/football-api'

export const revalidate = 3600

export default async function TeamsPage() {
  let teams: Awaited<ReturnType<typeof fetchAllTeams>> = []
  try {
    teams = await fetchAllTeams()
  } catch {
    // API unavailable
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Teams</h1>
      {teams.length === 0 && (
        <p className="text-white/40">Team data is not available yet.</p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {teams.map((team) => (
          <Link
            key={team.externalId}
            href={`/teams/${team.externalId}`}
            className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors"
          >
            {team.crest ? (
              <Image src={team.crest} alt={team.name} width={48} height={48} className="object-contain" />
            ) : (
              <div className="h-12 w-12 rounded bg-white/10" />
            )}
            <span className="text-xs text-center text-white/80 leading-tight">{team.name}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
