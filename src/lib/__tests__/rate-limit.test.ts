import { describe, it, expect, beforeEach } from 'vitest'
import { checkRateLimit, RateLimitStore } from '../rate-limit'

describe('checkRateLimit', () => {
  let store: RateLimitStore

  beforeEach(() => {
    store = new RateLimitStore()
  })

  it('allows requests under the limit', () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(store, 'key', 5, 60_000)).toBe(true)
    }
  })

  it('blocks the request that exceeds the limit', () => {
    for (let i = 0; i < 5; i++) checkRateLimit(store, 'key', 5, 60_000)
    expect(checkRateLimit(store, 'key', 5, 60_000)).toBe(false)
  })

  it('resets after the window expires', () => {
    for (let i = 0; i < 5; i++) checkRateLimit(store, 'key', 5, 60_000)
    // Simulate window expiry by manipulating the entry
    const entry = (store as unknown as { map: Map<string, { count: number; resetAt: number }> }).map.get('key')!
    entry.resetAt = Date.now() - 1  // expired
    expect(checkRateLimit(store, 'key', 5, 60_000)).toBe(true)
  })

  it('tracks different keys independently', () => {
    for (let i = 0; i < 5; i++) checkRateLimit(store, 'ip-a', 5, 60_000)
    expect(checkRateLimit(store, 'ip-b', 5, 60_000)).toBe(true)
  })
})
