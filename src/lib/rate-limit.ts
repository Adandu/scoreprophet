import { headers } from 'next/headers'

interface BucketEntry {
  count: number
  resetAt: number
}

export class RateLimitStore {
  private readonly map = new Map<string, BucketEntry>()

  get(key: string): BucketEntry | undefined {
    return this.map.get(key)
  }

  set(key: string, entry: BucketEntry): void {
    this.map.set(key, entry)
  }
}

export function checkRateLimit(
  store: RateLimitStore,
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (entry.count >= limit) return false
  entry.count++
  return true
}

// Singleton stores (in-process, reset on server restart)
const loginStore = new RateLimitStore()
const registerStore = new RateLimitStore()
const resetRequestStore = new RateLimitStore()
const resetExecuteStore = new RateLimitStore()

async function getClientIp(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'unknown'
}

export async function rateLimitLogin(): Promise<boolean> {
  const ip = await getClientIp()
  return checkRateLimit(loginStore, ip, 5, 5 * 60_000)
}

export async function rateLimitRegister(): Promise<boolean> {
  const ip = await getClientIp()
  return checkRateLimit(registerStore, ip, 5, 60 * 60_000)
}

export async function rateLimitResetRequest(): Promise<boolean> {
  const ip = await getClientIp()
  return checkRateLimit(resetRequestStore, ip, 3, 60 * 60_000)
}

export async function rateLimitResetExecute(): Promise<boolean> {
  const ip = await getClientIp()
  return checkRateLimit(resetExecuteStore, ip, 5, 60 * 60_000)
}
