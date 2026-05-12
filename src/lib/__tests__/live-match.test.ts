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
