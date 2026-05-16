import { describe, it, expect } from 'vitest'
import { normalizeEmail } from '../utils'

describe('normalizeEmail', () => {
  it('lowercases and trims valid email', () => {
    expect(normalizeEmail('  User@Example.COM  ')).toBe('user@example.com')
  })
  it('returns null for empty string', () => {
    expect(normalizeEmail('')).toBeNull()
  })
  it('returns null for invalid email', () => {
    expect(normalizeEmail('notanemail')).toBeNull()
    expect(normalizeEmail('@no-local')).toBeNull()
  })
  it('returns null for whitespace only', () => {
    expect(normalizeEmail('   ')).toBeNull()
  })
})
