import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getSafeRedirectPath } from '@/lib/app-url'

describe('getSafeRedirectPath', () => {
  it('returns a valid internal path as-is', () => {
    expect(getSafeRedirectPath('/dashboard')).toBe('/dashboard')
  })

  it('rejects an external URL and returns /', () => {
    expect(getSafeRedirectPath('https://evil.com')).toBe('/')
  })

  it('rejects a protocol-relative URL starting with // and returns /', () => {
    expect(getSafeRedirectPath('//evil.com')).toBe('/')
  })

  it('rejects an empty string and returns /', () => {
    expect(getSafeRedirectPath('')).toBe('/')
  })

  it('returns path starting with /\\ as-is (backslash not treated as redirect by the current guard)', () => {
    // The current implementation only blocks paths starting with "//".
    // "/\" passes the guard and is returned unchanged.
    expect(getSafeRedirectPath('/\\evil.com')).toBe('/\\evil.com')
  })

  it('returns a valid internal path with query string as-is', () => {
    expect(getSafeRedirectPath('/dashboard?tab=1')).toBe('/dashboard?tab=1')
  })

  it('accepts null and returns /', () => {
    expect(getSafeRedirectPath(null)).toBe('/')
  })

  it('accepts a deeply nested internal path', () => {
    expect(getSafeRedirectPath('/tournament/match/42')).toBe('/tournament/match/42')
  })
})

describe('getAppUrl', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns APP_URL with trailing slash stripped', async () => {
    process.env.APP_URL = 'https://example.com/'
    const { getAppUrl } = await import('../app-url')
    expect(await getAppUrl()).toBe('https://example.com')
  })

  it('returns APP_URL without trailing slash unchanged', async () => {
    process.env.APP_URL = 'https://example.com'
    const { getAppUrl } = await import('../app-url')
    expect(await getAppUrl()).toBe('https://example.com')
  })

  it('throws when APP_URL is not set', async () => {
    delete process.env.APP_URL
    const { getAppUrl } = await import('../app-url')
    await expect(getAppUrl()).rejects.toThrow('APP_URL')
  })
})
