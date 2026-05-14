export interface FormationPosition {
  left: number  // percentage 0–100
  top: number   // percentage 0–100
}

const FALLBACK_PALETTE = [
  '#8b5cf6', '#ec4899', '#f59e0b', '#14b8a6',
  '#f97316', '#06b6d4', '#84cc16', '#a855f7',
]

export function getTeamColor(teamId: string, crestUrl = ''): string {
  const source = `${teamId}:${crestUrl}`
  const hash = Array.from(source).reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0)
  const idx = Math.abs(hash) % FALLBACK_PALETTE.length
  return FALLBACK_PALETTE[idx]
}

// Default formation used when formation string is missing or unparseable
const DEFAULT_FORMATION = '4-4-2'

/**
 * Given a formation string like "4-3-3" and side, returns an array of 11
 * {left, top} percentage positions — GK first, then outfield lines in order.
 * Home: attacking right (GK near left). Away: attacking left (GK near right).
 */
export function computeFormationPositions(
  formation: string,
  side: 'home' | 'away'
): FormationPosition[] {
  const raw = formation.trim() || DEFAULT_FORMATION
  const lineCounts = raw.split('-').map(Number).filter((n) => !isNaN(n) && n > 0)
  if (lineCounts.length === 0 || lineCounts.reduce((a, b) => a + b, 0) !== 10) {
    // Fallback: parse default
    return computeFormationPositions(DEFAULT_FORMATION, side)
  }

  const positions: FormationPosition[] = []

  // GK
  const gkLeft = side === 'home' ? 5 : 95
  positions.push({ left: gkLeft, top: 50 })

  // Outfield lines: spread x between 17% and 47% (home) or 83% to 53% (away)
  const numLines = lineCounts.length
  const xStart = side === 'home' ? 17 : 83
  const xEnd = side === 'home' ? 47 : 53
  const xStep = numLines > 1 ? (xEnd - xStart) / (numLines - 1) : 0

  lineCounts.forEach((count, lineIndex) => {
    const left = Math.round(xStart + xStep * lineIndex)
    for (let i = 0; i < count; i++) {
      const top = Math.round((100 / (count + 1)) * (i + 1))
      positions.push({ left, top })
    }
  })

  return positions
}
