export interface StoredHeadToHeadMatch {
  id: string
  utcDate: string
  competition: string
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
}

export function parseStoredHeadToHead(value: string | null | undefined): StoredHeadToHeadMatch[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isStoredHeadToHeadMatch)
  } catch {
    return []
  }
}

function isStoredHeadToHeadMatch(value: unknown): value is StoredHeadToHeadMatch {
  if (!value || typeof value !== 'object') return false
  const match = value as Record<string, unknown>
  return (
    typeof match.id === 'string' &&
    typeof match.utcDate === 'string' &&
    typeof match.competition === 'string' &&
    typeof match.homeTeam === 'string' &&
    typeof match.awayTeam === 'string' &&
    (typeof match.homeScore === 'number' || match.homeScore === null) &&
    (typeof match.awayScore === 'number' || match.awayScore === null)
  )
}
