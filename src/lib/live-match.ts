export interface FormationPosition {
  left: number  // percentage 0–100
  top: number   // percentage 0–100
}

const CLUB_COLOR_MAP: Record<string, string> = {
  black: '#111827',
  blue: '#2563eb',
  gold: '#d4af37',
  green: '#16a34a',
  maroon: '#7f1d1d',
  navy: '#1e3a8a',
  orange: '#f97316',
  purple: '#9333ea',
  red: '#dc2626',
  sky: '#38bdf8',
  white: '#f8fafc',
  yellow: '#facc15',
}

export function getTeamColor(teamId: string, crestUrl = '', clubColors = ''): string {
  const clubColor = getColorFromClubColors(clubColors)
  if (clubColor) return clubColor

  const source = `${teamId}:${crestUrl}`
  const hash = fnv1a(source)
  const hue = hash % 360
  const saturation = 62 + ((hash >>> 9) % 18)
  const lightness = 42 + ((hash >>> 17) % 12)
  return hslToHex(hue, saturation, lightness)
}

function getColorFromClubColors(value: string): string | null {
  const tokens = value.toLowerCase().split(/[^a-z]+/).filter(Boolean)
  for (const token of tokens) {
    const color = CLUB_COLOR_MAP[token]
    if (color) return color
  }
  return null
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100
  const l = lightness / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    hue < 60 ? [c, x, 0] :
    hue < 120 ? [x, c, 0] :
    hue < 180 ? [0, c, x] :
    hue < 240 ? [0, x, c] :
    hue < 300 ? [x, 0, c] :
    [c, 0, x]

  return `#${toHex(r + m)}${toHex(g + m)}${toHex(b + m)}`
}

function toHex(value: number): string {
  return Math.round(value * 255).toString(16).padStart(2, '0')
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
