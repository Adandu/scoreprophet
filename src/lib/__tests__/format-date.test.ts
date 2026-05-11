import { describe, it, expect } from 'vitest'
import { formatMatchTime } from '@/lib/format-date'

describe('formatMatchTime', () => {
  it('formats a UTC date in Europe/Bucharest timezone (UTC+3 in summer)', () => {
    const date = new Date('2026-06-11T15:00:00.000Z')
    const result = formatMatchTime(date, 'Europe/Bucharest')
    expect(result).toContain('18:00')
  })

  it('formats a UTC date in UTC timezone', () => {
    const date = new Date('2026-06-11T15:00:00.000Z')
    const result = formatMatchTime(date, 'UTC')
    expect(result).toContain('15:00')
  })

  it('accepts an ISO string as input', () => {
    const result = formatMatchTime('2026-06-11T15:00:00.000Z', 'UTC')
    expect(result).toContain('15:00')
  })

  it('falls back to Europe/Bucharest for invalid timezone', () => {
    const date = new Date('2026-06-11T15:00:00.000Z')
    expect(() => formatMatchTime(date, 'Not/ATimezone')).not.toThrow()
    const result = formatMatchTime(date, 'Not/ATimezone')
    expect(result).toContain('18:00')
  })
})
