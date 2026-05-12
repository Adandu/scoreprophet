# Live Match Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/live` page that shows a real-time 3D tactical formation view during a live match, including score header, bench/coach/referee bar, goals, cards, substitutions, and possession bar — all auto-refreshing every 60 seconds.

**Architecture:** A Next.js App Router server component at `/app/live/page.tsx` fetches live match data from football-data.org v4, then renders `PitchFormation` (a pure server component with CSS 3D perspective) and separate event cards. A tiny `'use client'` `LivePageRefresh` component handles the 60-second browser refresh cycle. The navbar checks Prisma for a live match to conditionally show a "Live" link.

**Tech Stack:** Next.js 15 App Router (RSC), football-data.org v4 API, Tailwind CSS, TypeScript, Vitest

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/football-api.ts` | Add `LiveMatchDetails` types + `fetchLiveMatchDetails()` |
| Create | `src/lib/live-match.ts` | `computeFormationPositions()`, `getTeamColor()` pure utilities |
| Create | `src/lib/__tests__/live-match.test.ts` | Tests for both utilities |
| Create | `src/components/live-page-refresh.tsx` | `'use client'` 60s auto-refresh |
| Create | `src/components/pitch-formation.tsx` | 3D pitch + player shirts (server component) |
| Create | `src/app/live/page.tsx` | Full live match page (server component) |
| Modify | `src/components/navbar.tsx` | Add "Live" link when a match is live |

---

## Task 1: Add `LiveMatchDetails` types and `fetchLiveMatchDetails` to `football-api.ts`

**Files:**
- Modify: `src/lib/football-api.ts`

- [ ] **Step 1: Add types at the top of the file (after existing types)**

Add after the `HeadToHeadSummary` interface:

```typescript
export interface LivePlayer {
  id: string
  name: string
  shirtNumber: number
  position: string // "Goalkeeper" | "Defence" | "Midfield" | "Offence"
}

export interface LiveTeam {
  id: string
  name: string
  crest: string
  formation: string  // e.g. "4-3-3", empty string if unknown
  lineup: LivePlayer[]
  bench: LivePlayer[]
  coach: string | null
}

export interface LiveMatchEvent {
  minute: number
  teamId: string
  playerName: string
}

export interface LiveMatchSubstitution {
  minute: number
  teamId: string
  playerOutName: string
  playerInName: string
}

export interface LiveMatchBooking extends LiveMatchEvent {
  card: 'YELLOW_CARD' | 'RED_CARD' | 'YELLOW_RED_CARD'
}

export interface LiveMatchDetails {
  matchId: string
  status: string
  minute: number | null
  venue: string | null
  homeScore: number | null
  awayScore: number | null
  homeTeam: LiveTeam
  awayTeam: LiveTeam
  referee: { name: string; nationality: string } | null
  goals: LiveMatchEvent[]
  bookings: LiveMatchBooking[]
  substitutions: LiveMatchSubstitution[]
  homePossession: number | null  // 0–100, null if not available
}
```

- [ ] **Step 2: Add `fetchLiveMatchDetails` function at the bottom of `football-api.ts`**

```typescript
export async function fetchLiveMatchDetails(matchId: string | number): Promise<LiveMatchDetails> {
  const res = await fetch(
    `${BASE_URL}/matches/${matchId}`,
    {
      headers: getHeaders(),
      next: { revalidate: 60 },
    }
  )
  if (!res.ok) {
    throw new Error(`football-data.org error ${res.status}: ${res.statusText}`)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = await res.json()

  const homeId = String(m.homeTeam?.id ?? '')
  const awayId = String(m.awayTeam?.id ?? '')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalizePlayer = (p: any): LivePlayer => ({
    id: String(p.id ?? ''),
    name: p.name ?? '',
    shirtNumber: p.shirtNumber ?? 0,
    position: p.position ?? '',
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalizeTeam = (t: any): LiveTeam => ({
    id: String(t.id ?? ''),
    name: t.name ?? '',
    crest: t.crest ?? '',
    formation: t.formation ?? '',
    lineup: (t.lineup ?? []).map(normalizePlayer),
    bench: (t.bench ?? []).map(normalizePlayer),
    coach: t.coach?.name ?? null,
  })

  const referee = (m.referees ?? []).find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r: any) => r.role === 'REFEREE'
  )

  // Extract possession from statistics if present
  let homePossession: number | null = null
  if (Array.isArray(m.statistics)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const homeStats = m.statistics.find((s: any) => String(s.team?.id) === homeId)
    if (homeStats) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const poss = homeStats.statistics?.find((s: any) => s.type === 'BALL_POSSESSION')
      if (poss?.value != null) homePossession = Number(poss.value)
    }
  }

  return {
    matchId: String(m.id),
    status: STATUS_MAP[m.status] ?? m.status ?? '',
    minute: m.minute ?? null,
    venue: m.venue ?? null,
    homeScore: m.score?.fullTime?.home ?? null,
    awayScore: m.score?.fullTime?.away ?? null,
    homeTeam: normalizeTeam(m.homeTeam ?? {}),
    awayTeam: normalizeTeam(m.awayTeam ?? {}),
    referee: referee
      ? { name: referee.name ?? '', nationality: referee.nationality ?? '' }
      : null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    goals: (m.goals ?? []).map((g: any): LiveMatchEvent => ({
      minute: g.minute ?? 0,
      teamId: String(g.team?.id ?? ''),
      playerName: g.scorer?.name ?? '',
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bookings: (m.bookings ?? []).map((b: any): LiveMatchBooking => ({
      minute: b.minute ?? 0,
      teamId: String(b.team?.id ?? ''),
      playerName: b.player?.name ?? '',
      card: b.card ?? 'YELLOW_CARD',
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    substitutions: (m.substitutions ?? []).map((s: any): LiveMatchSubstitution => ({
      minute: s.minute ?? 0,
      teamId: String(s.team?.id ?? ''),
      playerOutName: s.playerOut?.name ?? '',
      playerInName: s.playerIn?.name ?? '',
    })),
    homePossession,
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /mnt/sdb/AI/ScoreProphet && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (or only pre-existing errors unrelated to this file)

- [ ] **Step 4: Commit**

```bash
cd /mnt/sdb/AI/ScoreProphet && git add src/lib/football-api.ts && git commit -m "feat: add LiveMatchDetails types and fetchLiveMatchDetails"
```

---

## Task 2: Formation positioning and team color utilities + tests

**Files:**
- Create: `src/lib/live-match.ts`
- Create: `src/lib/__tests__/live-match.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/__tests__/live-match.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeFormationPositions, getTeamColor } from '@/lib/live-match'

describe('computeFormationPositions', () => {
  it('returns 11 positions for a valid 4-3-3 home formation', () => {
    const positions = computeFormationPositions('4-3-3', 'home')
    expect(positions).toHaveLength(11)
  })

  it('returns 11 positions for a valid 4-2-3-1 home formation', () => {
    const positions = computeFormationPositions('4-2-3-1', 'home')
    expect(positions).toHaveLength(11)
  })

  it('places home GK at left:5%, top:50%', () => {
    const positions = computeFormationPositions('4-3-3', 'home')
    expect(positions[0]).toEqual({ left: 5, top: 50 })
  })

  it('places away GK at left:95%, top:50%', () => {
    const positions = computeFormationPositions('4-3-3', 'away')
    expect(positions[0]).toEqual({ left: 95, top: 50 })
  })

  it('evenly spaces 4 defenders vertically', () => {
    const positions = computeFormationPositions('4-3-3', 'home')
    // 4 defenders = players index 1–4
    const defenders = positions.slice(1, 5)
    expect(defenders[0].top).toBe(20)
    expect(defenders[1].top).toBe(40)
    expect(defenders[2].top).toBe(60)
    expect(defenders[3].top).toBe(80)
  })

  it('handles empty/unknown formation by returning 11 fallback positions', () => {
    const positions = computeFormationPositions('', 'home')
    expect(positions).toHaveLength(11)
  })
})

describe('getTeamColor', () => {
  it('returns the known color for Brazil', () => {
    expect(getTeamColor('Brazil', '759')).toBe('#009c3b')
  })

  it('returns the known color for France', () => {
    expect(getTeamColor('France', '773')).toBe('#002395')
  })

  it('returns a consistent fallback color for unknown teams', () => {
    const color1 = getTeamColor('Unknown FC', '9999')
    const color2 = getTeamColor('Unknown FC', '9999')
    expect(color1).toBe(color2)
    expect(color1).toMatch(/^#[0-9a-f]{6}$/i)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /mnt/sdb/AI/ScoreProphet && npx vitest run src/lib/__tests__/live-match.test.ts 2>&1 | tail -20
```

Expected: FAIL — `@/lib/live-match` not found

- [ ] **Step 3: Create `src/lib/live-match.ts`**

```typescript
export interface FormationPosition {
  left: number  // percentage 0–100
  top: number   // percentage 0–100
}

const TEAM_COLORS: Record<string, string> = {
  'Brazil': '#009c3b',
  'France': '#002395',
  'Germany': '#d00000',
  'Argentina': '#74acdf',
  'Spain': '#c60b1e',
  'England': '#cf081f',
  'Portugal': '#006600',
  'Netherlands': '#ff6600',
  'Italy': '#0066cc',
  'Belgium': '#cc0000',
  'Croatia': '#cc2222',
  'Morocco': '#c1272d',
  'USA': '#b22234',
  'Mexico': '#006847',
  'Japan': '#bc002d',
  'Senegal': '#00853f',
  'Uruguay': '#5EB6E4',
  'Colombia': '#FCD116',
  'Switzerland': '#FF0000',
  'Denmark': '#C60C30',
  'Serbia': '#C6363C',
  'Poland': '#DC143C',
  'Australia': '#FFCD00',
  'Ecuador': '#FFD100',
  'Ghana': '#006B3F',
  'Cameroon': '#007A5E',
  'Tunisia': '#E70013',
  'Saudi Arabia': '#006C35',
  'IR Iran': '#239F40',
  'South Korea': '#003478',
  'Qatar': '#8D1B3D',
  'Canada': '#FF0000',
}

const FALLBACK_PALETTE = [
  '#8b5cf6', '#ec4899', '#f59e0b', '#14b8a6',
  '#f97316', '#06b6d4', '#84cc16', '#a855f7',
]

export function getTeamColor(teamName: string, teamId: string): string {
  if (TEAM_COLORS[teamName]) return TEAM_COLORS[teamName]
  const idx = Math.abs(parseInt(teamId, 10) || 0) % FALLBACK_PALETTE.length
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /mnt/sdb/AI/ScoreProphet && npx vitest run src/lib/__tests__/live-match.test.ts 2>&1 | tail -20
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd /mnt/sdb/AI/ScoreProphet && git add src/lib/live-match.ts src/lib/__tests__/live-match.test.ts && git commit -m "feat: add formation positions and team color utilities with tests"
```

---

## Task 3: `LivePageRefresh` client component

**Files:**
- Create: `src/components/live-page-refresh.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function LivePageRefresh() {
  const router = useRouter()

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 60_000)
    return () => clearInterval(interval)
  }, [router])

  return null
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /mnt/sdb/AI/ScoreProphet && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors

- [ ] **Step 3: Commit**

```bash
cd /mnt/sdb/AI/ScoreProphet && git add src/components/live-page-refresh.tsx && git commit -m "feat: add LivePageRefresh client component"
```

---

## Task 4: `PitchFormation` server component

**Files:**
- Create: `src/components/pitch-formation.tsx`

This is a pure server component that renders the entire 3D pitch section: coach bar, formation bar, bench + pitch + bench, and possession bar. It contains all the CSS from the mockup as Tailwind + inline styles.

- [ ] **Step 1: Create `src/components/pitch-formation.tsx`**

```typescript
import type { LiveTeam, LiveMatchEvent, LiveMatchBooking, LiveMatchSubstitution } from '@/lib/football-api'
import { computeFormationPositions, getTeamColor } from '@/lib/live-match'

interface Props {
  homeTeam: LiveTeam
  awayTeam: LiveTeam
  goals: LiveMatchEvent[]
  bookings: LiveMatchBooking[]
  substitutions: LiveMatchSubstitution[]
  referee: { name: string; nationality: string } | null
  homePossession: number | null
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgb(${Math.min(255, Math.round(r + (255 - r) * amount))},${Math.min(255, Math.round(g + (255 - g) * amount))},${Math.min(255, Math.round(b + (255 - b) * amount))})`
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgb(${Math.round(r * (1 - amount))},${Math.round(g * (1 - amount))},${Math.round(b * (1 - amount))})`
}

function GradientDef({ id, hex }: { id: string; hex: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0.85" y2="1">
      <stop offset="0%" stopColor={lighten(hex, 0.5)} />
      <stop offset="45%" stopColor={hex} />
      <stop offset="100%" stopColor={darken(hex, 0.4)} />
    </linearGradient>
  )
}

function ShirtSvg({ gradientId }: { gradientId: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
      <path d="M2,17 L12,2 L17,9 L20,13 L23,9 L28,2 L38,17 L30,14 L30,37 L10,37 L10,14 Z" fill={`url(#${gradientId})`} filter="url(#shirt-shadow)" />
      <path d="M2,17 L12,2 L15,7 L10,14 Z" fill="rgba(255,255,255,0.22)" />
      <path d="M12,2 L17,9 L20,13 L23,9 L28,2 L20,6 Z" fill="rgba(255,255,255,0.1)" />
      <path d="M2,17 L12,2 L17,9 L20,13 L23,9 L28,2 L38,17 L30,14 L30,37 L10,37 L10,14 Z" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="0.7" />
    </svg>
  )
}

interface PlayerDotProps {
  name: string
  shirtNumber: number
  isGk: boolean
  gradientId: string
  left: number
  top: number
  goalCount: number
  yellowCards: number
  redCard: boolean
  subMinute: number | null
}

function PlayerDot({ name, shirtNumber, isGk, gradientId, left, top, goalCount, yellowCards, redCard, subMinute }: PlayerDotProps) {
  const displayName = [
    name,
    goalCount > 0 ? '⚽'.repeat(Math.min(goalCount, 3)) : '',
    yellowCards === 1 ? '🟨' : yellowCards >= 2 ? '🟥' : '',
    redCard ? '🟥' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      style={{
        position: 'absolute',
        left: `${left}%`,
        top: `${top}%`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        transform: 'translate(-50%, -50%) translateZ(4px) rotateX(-20deg)',
        transformOrigin: 'center bottom',
        zIndex: 2,
        gap: '3px',
      }}
    >
      <div style={{ position: 'relative', width: 64, height: 68, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <ShirtSvg gradientId={isGk ? 'live-gk' : gradientId} />
        <span style={{ position: 'relative', zIndex: 2, fontSize: 15, fontWeight: 900, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,1)', marginTop: 12 }}>
          {shirtNumber}
        </span>
      </div>
      <span style={{
        fontSize: 13, fontWeight: 700, color: '#fff', textAlign: 'center',
        whiteSpace: 'nowrap', maxWidth: 88, overflow: 'hidden', textOverflow: 'ellipsis',
        background: 'rgba(0,0,0,0.72)', borderRadius: 4, padding: '2px 6px',
      }}>
        {displayName}
        {subMinute !== null && <span style={{ color: '#4ade80', marginLeft: 3, fontSize: 10 }}>↑{subMinute}&apos;</span>}
      </span>
    </div>
  )
}

export function PitchFormation({ homeTeam, awayTeam, goals, bookings, substitutions, referee, homePossession }: Props) {
  const homeColor = getTeamColor(homeTeam.name, homeTeam.id)
  const awayColor = getTeamColor(awayTeam.name, awayTeam.id)
  const homeGradId = `live-home-${homeTeam.id}`
  const awayGradId = `live-away-${awayTeam.id}`

  const homePositions = computeFormationPositions(homeTeam.formation, 'home')
  const awayPositions = computeFormationPositions(awayTeam.formation, 'away')

  // Build per-player event maps keyed by player name (lowercase)
  const goalsByPlayer = new Map<string, number>()
  for (const g of goals) {
    const key = g.playerName.toLowerCase()
    goalsByPlayer.set(key, (goalsByPlayer.get(key) ?? 0) + 1)
  }

  const yellowsByPlayer = new Map<string, number>()
  const redsByPlayer = new Set<string>()
  for (const b of bookings) {
    const key = b.playerName.toLowerCase()
    if (b.card === 'YELLOW_CARD') yellowsByPlayer.set(key, (yellowsByPlayer.get(key) ?? 0) + 1)
    if (b.card === 'RED_CARD' || b.card === 'YELLOW_RED_CARD') redsByPlayer.add(key)
  }

  const subOnMinutes = new Map<string, number>()
  for (const s of substitutions) {
    subOnMinutes.set(s.playerInName.toLowerCase(), s.minute)
  }

  const possession = homePossession ?? 50
  const awayPossession = 100 - possession

  const homeBenchSubbed = new Set(substitutions.filter(s => s.teamId === homeTeam.id).map(s => s.playerOutName.toLowerCase()))
  const awayBenchSubbed = new Set(substitutions.filter(s => s.teamId === awayTeam.id).map(s => s.playerOutName.toLowerCase()))

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
      {/* Shared SVG defs */}
      <svg width="0" height="0" style={{ position: 'absolute', overflow: 'hidden' }}>
        <defs>
          <GradientDef id={homeGradId} hex={homeColor} />
          <GradientDef id={awayGradId} hex={awayColor} />
          <linearGradient id="live-gk" x1="0" y1="0" x2="0.85" y2="1">
            <stop offset="0%" stopColor="#fcd34d" />
            <stop offset="45%" stopColor="#d97706" />
            <stop offset="100%" stopColor="#7c2d12" />
          </linearGradient>
          <filter id="shirt-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#000" floodOpacity="0.55" />
          </filter>
        </defs>
      </svg>

      {/* Coach + Referee bar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', background: '#071120', padding: '8px 12px', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>Head Coach</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#4ade80' }}>{homeTeam.coach ?? '—'}</div>
        </div>
        {referee && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>Referee</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{referee.name}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{referee.nationality}</div>
          </div>
        )}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>Head Coach</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#93bbff' }}>{awayTeam.coach ?? '—'}</div>
        </div>
      </div>

      {/* Formation bar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', background: '#0a1628', padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#4ade80' }}>{homeTeam.formation || '—'}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', fontWeight: 700 }}>vs</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#93bbff', textAlign: 'right' }}>{awayTeam.formation || '—'}</div>
      </div>

      {/* Bench + Pitch + Bench row */}
      <div style={{ display: 'flex', alignItems: 'stretch' }}>

        {/* Home bench */}
        <div style={{ width: 108, flexShrink: 0, background: '#071120', display: 'flex', flexDirection: 'column', padding: '10px 8px', gap: 4, borderRight: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 4, paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            {homeTeam.name} bench
          </div>
          {homeTeam.bench.map((p) => {
            const subMin = subOnMinutes.get(p.name.toLowerCase())
            const wasSubbedOut = homeBenchSubbed.has(p.name.toLowerCase())
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: wasSubbedOut ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.73)', lineHeight: 1.5 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', width: 16, textAlign: 'right', flexShrink: 0 }}>{p.shirtNumber}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name.split(' ').pop()}</span>
                {subMin !== undefined && (
                  <span style={{ fontSize: 9, color: '#4ade80', fontWeight: 700, whiteSpace: 'nowrap' }}>↑{subMin}&apos;</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Pitch section */}
        <div style={{ flex: 1, minWidth: 0, background: '#071120' }}>
          <div style={{ perspective: 900, perspectiveOrigin: '50% 0%', padding: '10px 0 0' }}>
            <div style={{
              background: 'repeating-linear-gradient(0deg, #236f23 0px, #236f23 26px, #28832a 26px, #28832a 52px)',
              position: 'relative', width: '100%',
              aspectRatio: '105/68',
              overflow: 'visible',
              transform: 'rotateX(20deg)',
              transformOrigin: 'center bottom',
              transformStyle: 'preserve-3d',
              boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 0 2px rgba(255,255,255,0.13)',
            }}>
              {/* Pitch markings */}
              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, background: 'rgba(255,255,255,0.3)', transform: 'translateX(-50%)' }} />
              <div style={{ position: 'absolute', left: '50%', top: '50%', width: '18%', paddingTop: '18%', border: '2px solid rgba(255,255,255,0.35)', borderRadius: '50%', transform: 'translate(-50%,-50%)' }} />
              <div style={{ position: 'absolute', left: '50%', top: '50%', width: 8, height: 8, background: 'rgba(255,255,255,0.55)', borderRadius: '50%', transform: 'translate(-50%,-50%)' }} />
              <div style={{ position: 'absolute', left: 0, top: '22%', width: '11%', height: '56%', border: '2px solid rgba(255,255,255,0.25)', borderLeft: 'none' }} />
              <div style={{ position: 'absolute', right: 0, top: '22%', width: '11%', height: '56%', border: '2px solid rgba(255,255,255,0.25)', borderRight: 'none' }} />
              <div style={{ position: 'absolute', left: 0, top: '38%', width: '2.5%', height: '24%', background: 'rgba(255,255,255,0.1)', border: '2px solid rgba(255,255,255,0.3)', borderLeft: 'none' }} />
              <div style={{ position: 'absolute', right: 0, top: '38%', width: '2.5%', height: '24%', background: 'rgba(255,255,255,0.1)', border: '2px solid rgba(255,255,255,0.3)', borderRight: 'none' }} />
              <div style={{ position: 'absolute', inset: 0, border: '2px solid rgba(255,255,255,0.28)', pointerEvents: 'none' }} />

              {/* Home players */}
              {homeTeam.lineup.map((player, i) => {
                const pos = homePositions[i] ?? { left: 25, top: 50 }
                const key = player.name.toLowerCase()
                return (
                  <PlayerDot
                    key={player.id}
                    name={player.name.split(' ').pop() ?? player.name}
                    shirtNumber={player.shirtNumber}
                    isGk={player.position === 'Goalkeeper'}
                    gradientId={homeGradId}
                    left={pos.left}
                    top={pos.top}
                    goalCount={goalsByPlayer.get(key) ?? 0}
                    yellowCards={yellowsByPlayer.get(key) ?? 0}
                    redCard={redsByPlayer.has(key)}
                    subMinute={null}
                  />
                )
              })}

              {/* Away players */}
              {awayTeam.lineup.map((player, i) => {
                const pos = awayPositions[i] ?? { left: 75, top: 50 }
                const key = player.name.toLowerCase()
                return (
                  <PlayerDot
                    key={player.id}
                    name={player.name.split(' ').pop() ?? player.name}
                    shirtNumber={player.shirtNumber}
                    isGk={player.position === 'Goalkeeper'}
                    gradientId={awayGradId}
                    left={pos.left}
                    top={pos.top}
                    goalCount={goalsByPlayer.get(key) ?? 0}
                    yellowCards={yellowsByPlayer.get(key) ?? 0}
                    redCard={redsByPlayer.has(key)}
                    subMinute={null}
                  />
                )
              })}
            </div>
          </div>

          {/* Possession bar */}
          <div style={{ background: '#071120', padding: '10px 14px 14px', position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontWeight: 800, color: '#4ade80', fontSize: 13 }}>{possession}%</span>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase' }}>Ball Possession</span>
              <span style={{ fontWeight: 800, color: '#93bbff', fontSize: 13 }}>{awayPossession}%</span>
            </div>
            <div style={{ height: 9, borderRadius: 5, overflow: 'hidden', display: 'flex' }}>
              <div style={{ background: homeColor, width: `${possession}%` }} />
              <div style={{ background: awayColor, flex: 1 }} />
            </div>
          </div>
        </div>

        {/* Away bench */}
        <div style={{ width: 108, flexShrink: 0, background: '#071120', display: 'flex', flexDirection: 'column', padding: '10px 8px', gap: 4, borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 4, paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            {awayTeam.name} bench
          </div>
          {awayTeam.bench.map((p) => {
            const subMin = subOnMinutes.get(p.name.toLowerCase())
            const wasSubbedOut = awayBenchSubbed.has(p.name.toLowerCase())
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: wasSubbedOut ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.73)', lineHeight: 1.5 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', width: 16, textAlign: 'right', flexShrink: 0 }}>{p.shirtNumber}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name.split(' ').pop()}</span>
                {subMin !== undefined && (
                  <span style={{ fontSize: 9, color: '#93bbff', fontWeight: 700, whiteSpace: 'nowrap' }}>↑{subMin}&apos;</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /mnt/sdb/AI/ScoreProphet && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors

- [ ] **Step 3: Commit**

```bash
cd /mnt/sdb/AI/ScoreProphet && git add src/components/pitch-formation.tsx && git commit -m "feat: add PitchFormation server component"
```

---

## Task 5: `/live` page

**Files:**
- Create: `src/app/live/page.tsx`

- [ ] **Step 1: Create `src/app/live/page.tsx`**

```typescript
import Image from 'next/image'
import { fetchLiveMatch, fetchLiveMatchDetails } from '@/lib/football-api'
import { PitchFormation } from '@/components/pitch-formation'
import { LivePageRefresh } from '@/components/live-page-refresh'

export const revalidate = 60

export default async function LivePage() {
  const liveMatch = await fetchLiveMatch()

  if (!liveMatch) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="text-5xl">⚽</div>
        <h1 className="text-2xl font-bold text-white">No live match right now</h1>
        <p className="text-white/50">Check back when a match is in play.</p>
      </div>
    )
  }

  let details
  try {
    details = await fetchLiveMatchDetails(liveMatch.externalId)
  } catch {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="text-5xl">⚽</div>
        <h1 className="text-2xl font-bold text-white">Live match data unavailable</h1>
        <p className="text-white/50">Unable to load match details. Please try again shortly.</p>
      </div>
    )
  }

  const homeId = details.homeTeam.id
  const awayId = details.awayTeam.id
  const homeScore = details.homeScore ?? 0
  const awayScore = details.awayScore ?? 0

  const homeGoals = details.goals.filter((g) => g.teamId === homeId)
  const awayGoals = details.goals.filter((g) => g.teamId === awayId)
  const homeBookings = details.bookings.filter((b) => b.teamId === homeId)
  const awayBookings = details.bookings.filter((b) => b.teamId === awayId)
  const homeSubs = details.substitutions.filter((s) => s.teamId === homeId)
  const awaySubs = details.substitutions.filter((s) => s.teamId === awayId)

  return (
    <div className="space-y-4">
      <LivePageRefresh />

      {/* Score header */}
      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0a1628] px-8 py-5">
        <TeamBlock name={details.homeTeam.name} crest={details.homeTeam.crest} />

        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-2 rounded-full bg-red-950 px-3 py-0.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <span className="text-xs font-bold uppercase tracking-widest text-red-300">Live</span>
          </div>
          <div className="text-5xl font-black tabular-nums text-[#C9A84C]">
            {homeScore} <span className="text-white/30">:</span> {awayScore}
          </div>
          {details.minute !== null && (
            <div className="text-sm text-white/50">{details.minute}&apos;</div>
          )}
          {details.venue && (
            <div className="text-xs text-white/30">{details.venue}</div>
          )}
        </div>

        <TeamBlock name={details.awayTeam.name} crest={details.awayTeam.crest} />
      </div>

      {/* 3D Pitch */}
      <PitchFormation
        homeTeam={details.homeTeam}
        awayTeam={details.awayTeam}
        goals={details.goals}
        bookings={details.bookings}
        substitutions={details.substitutions}
        referee={details.referee}
        homePossession={details.homePossession}
      />

      {/* Goals */}
      {(homeGoals.length > 0 || awayGoals.length > 0) && (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0a1628]">
          <div className="border-b border-white/5 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white/40">
            ⚽ Goals
          </div>
          <div className="grid grid-cols-[1fr_1px_1fr]">
            <div className="flex flex-col gap-2 p-3">
              {homeGoals.map((g, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-green-400">⚽</span>
                  <span className="font-semibold text-white/80">{g.playerName}</span>
                  <span className="text-xs font-bold text-white/40">{g.minute}&apos;</span>
                </div>
              ))}
            </div>
            <div className="bg-white/5" />
            <div className="flex flex-col items-end gap-2 p-3">
              {awayGoals.map((g, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-xs font-bold text-white/40">{g.minute}&apos;</span>
                  <span className="font-semibold text-white/80">{g.playerName}</span>
                  <span className="text-blue-400">⚽</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Cards */}
      {(homeBookings.length > 0 || awayBookings.length > 0) && (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0a1628]">
          <div className="border-b border-white/5 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white/40">
            🟨 Cards
          </div>
          <div className="grid grid-cols-[1fr_1px_1fr]">
            <div className="flex flex-col gap-2 p-3">
              {homeBookings.map((b, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span>{b.card === 'YELLOW_CARD' ? '🟨' : '🟥'}</span>
                  <span className="font-semibold text-white/80">{b.playerName}</span>
                  <span className="text-xs font-bold text-white/40">{b.minute}&apos;</span>
                </div>
              ))}
            </div>
            <div className="bg-white/5" />
            <div className="flex flex-col items-end gap-2 p-3">
              {awayBookings.map((b, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-xs font-bold text-white/40">{b.minute}&apos;</span>
                  <span className="font-semibold text-white/80">{b.playerName}</span>
                  <span>{b.card === 'YELLOW_CARD' ? '🟨' : '🟥'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Substitutions */}
      {(homeSubs.length > 0 || awaySubs.length > 0) && (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0a1628]">
          <div className="border-b border-white/5 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white/40">
            🔄 Substitutions
          </div>
          <div className="grid grid-cols-[1fr_1px_1fr]">
            <div className="flex flex-col gap-2 p-3">
              {homeSubs.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5 text-sm">
                  <span className="font-bold text-green-400">↑</span>
                  <span className="font-semibold text-white/80">{s.playerInName}</span>
                  <span className="font-bold text-red-400">↓</span>
                  <span className="text-white/50">{s.playerOutName}</span>
                  <span className="ml-auto text-xs font-bold text-white/40">{s.minute}&apos;</span>
                </div>
              ))}
            </div>
            <div className="bg-white/5" />
            <div className="flex flex-col items-end gap-2 p-3">
              {awaySubs.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5 text-sm">
                  <span className="text-xs font-bold text-white/40">{s.minute}&apos;</span>
                  <span className="text-white/50">{s.playerOutName}</span>
                  <span className="font-bold text-red-400">↓</span>
                  <span className="font-semibold text-white/80">{s.playerInName}</span>
                  <span className="font-bold text-blue-400">↑</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TeamBlock({ name, crest }: { name: string; crest: string }) {
  return (
    <div className="flex min-w-[120px] flex-col items-center gap-2">
      {crest ? (
        <Image src={crest} alt={name} width={68} height={68} className="rounded" />
      ) : (
        <div className="flex h-[68px] w-[68px] items-center justify-center rounded-full border border-white/10 bg-white/10 text-4xl">⚽</div>
      )}
      <span className="text-center text-base font-bold text-white">{name}</span>
    </div>
  )
}
```

- [ ] **Step 2: Verify the build works**

```bash
cd /mnt/sdb/AI/ScoreProphet && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors

- [ ] **Step 3: Start dev server and verify the page loads**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm run dev &
sleep 5 && curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/live
```

Expected: `200` (or `307` redirect if login required — if so, the route exists)

- [ ] **Step 4: Commit**

```bash
cd /mnt/sdb/AI/ScoreProphet && git add src/app/live/page.tsx && git commit -m "feat: add /live match page with 3D pitch formation"
```

---

## Task 6: Add "Live" link to navbar

**Files:**
- Modify: `src/components/navbar.tsx`

- [ ] **Step 1: Import Prisma and add live match check to Navbar**

In `src/components/navbar.tsx`, add the Prisma import at the top and check for a live match:

Add after the existing imports:
```typescript
import { prisma } from '@/lib/db'
```

In the `Navbar` function body, after the existing `await Promise.all([...])`:
```typescript
const hasLiveMatch = await prisma.match.count({ where: { status: 'LIVE' } }).then((n) => n > 0)
```

- [ ] **Step 2: Add Live link in the desktop nav**

In the desktop nav links section (inside `<div className="hidden items-center gap-4 ...">`) add after the "Home" link:

```tsx
{hasLiveMatch && (
  <Link href="/live" className="flex items-center gap-1.5 font-semibold text-red-400 hover:text-red-300 transition-colors">
    <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
    Live
  </Link>
)}
```

- [ ] **Step 3: Update MobileMenu to accept and render the Live link**

In `src/components/navbar.tsx`, update the `<MobileMenu>` call (currently at the bottom of the nav div):
```tsx
<MobileMenu user={user} championships={championships} selectedChampionship={selectedChampionship} hasLiveMatch={hasLiveMatch} />
```

In `src/components/mobile-menu.tsx`, add `hasLiveMatch` to the props destructuring:

Change:
```typescript
export function MobileMenu({
  user,
  championships,
  selectedChampionship,
}: {
  user: User | null
  championships: Championship[]
  selectedChampionship: Championship | null
}) {
```

To:
```typescript
export function MobileMenu({
  user,
  championships,
  selectedChampionship,
  hasLiveMatch = false,
}: {
  user: User | null
  championships: Championship[]
  selectedChampionship: Championship | null
  hasLiveMatch?: boolean
}) {
```

Then in the `links` array definition, add the Live link at the top when active. Replace the existing `const links = [...]` with:
```typescript
const links = [
  { href: '/', label: 'Home' },
  ...championshipLinks,
  { href: '/tournament', label: 'Tournament' },
  { href: '/teams', label: 'Teams' },
  ...(user ? [{ href: '/profile', label: 'Profile' }] : []),
  ...(user?.isAdmin ? [{ href: '/admin', label: 'Admin' }] : []),
]
```

And in the JSX, just before `{links.map(...)}`, add:
```tsx
{hasLiveMatch && (
  <Link
    href="/live"
    onClick={() => setOpen(false)}
    className="flex items-center gap-1.5 rounded-md px-2 py-2 font-semibold text-red-400 hover:bg-white/10"
  >
    <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
    Live
  </Link>
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /mnt/sdb/AI/ScoreProphet && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
cd /mnt/sdb/AI/ScoreProphet && git add src/components/navbar.tsx src/components/mobile-menu.tsx && git commit -m "feat: show Live nav link when a match is in play"
```

---

## Task 7: Run full test suite and verify

- [ ] **Step 1: Run all tests**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm test 2>&1 | tail -30
```

Expected: All tests pass (existing tests + new live-match.test.ts)

- [ ] **Step 2: Final type check**

```bash
cd /mnt/sdb/AI/ScoreProphet && npx tsc --noEmit 2>&1
```

Expected: no errors

- [ ] **Step 3: Commit if any fixes needed**

```bash
cd /mnt/sdb/AI/ScoreProphet && git add -p && git commit -m "fix: address type errors from final check"
```
