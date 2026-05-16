# ScoreProphet Hardening & Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all bugs, security vulnerabilities, performance issues, technical debt, and implement Features 1, 3, 4, 5, 8 across the ScoreProphet Next.js/Prisma/SQLite app.

**Architecture:** 14 sequential tasks ordered by dependency — shared types first, schema second, security third, then features. Each task is self-contained and commits independently. Tests use Vitest (node environment, `npm test`).

**Tech Stack:** Next.js 15 App Router, Prisma 7 + better-sqlite3, iron-session, nodemailer, Vitest

---

### Task 1: Shared Types & Utils (DEBT-2, DEBT-3, DEBT-4, BUG-3)

**Files:**
- Create: `src/lib/types.ts`
- Modify: `src/lib/utils.ts`
- Modify: `src/lib/scoring.ts`
- Modify: `src/lib/validation.ts`
- Modify: `src/actions/predictions.ts` (import PredictionType from types.ts)
- Test: `src/lib/__tests__/utils.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/__tests__/utils.test.ts`:
```typescript
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
    expect(normalizeEmail('no-at-sign')).toBeNull()
  })
  it('returns null for whitespace only', () => {
    expect(normalizeEmail('   ')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm test -- utils.test 2>&1 | tail -20
```
Expected: FAIL with "normalizeEmail is not a function" or similar.

- [ ] **Step 3: Create `src/lib/types.ts`**

```typescript
export type PredictionType = 'SINGLE_OUTCOME' | 'DOUBLE_CHANCE' | 'EXACT_SCORE'

export type Stage =
  | 'GROUP'
  | 'ROUND_OF_32'
  | 'ROUND_OF_16'
  | 'QUARTER_FINAL'
  | 'SEMI_FINAL'
  | 'THIRD_PLACE'
  | 'FINAL'
```

- [ ] **Step 4: Add `normalizeEmail` to `src/lib/utils.ts`**

Current content of utils.ts only has `cn()`. Add after the existing function:
```typescript
export function normalizeEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null
}
```

- [ ] **Step 5: Update `src/lib/scoring.ts`**

Find the hardcoded point values and add a SCORING export. The file has `SINGLE_OUTCOME = 3, DOUBLE_CHANCE = 1, EXACT_SCORE = 5, ADVANCE = 1` or similar inline. Replace with:
```typescript
import type { PredictionType } from './types'

export const SCORING: Record<PredictionType | 'ADVANCE', number> = {
  EXACT_SCORE: 5,
  SINGLE_OUTCOME: 3,
  DOUBLE_CHANCE: 1,
  ADVANCE: 1,
}

// Keep existing functions but use SCORING constants internally
```

- [ ] **Step 6: Update `src/lib/validation.ts`**

Remove the local `PredictionType` definition. Import from types.ts:
```typescript
import type { PredictionType } from './types'
```
Fix JSDoc: change "max 15" comment to match `MAX_GOALS_PER_TEAM = 10`.

- [ ] **Step 7: Update `src/actions/predictions.ts`**

Import `PredictionType` from `'@/lib/types'` instead of redefining locally.

- [ ] **Step 8: Update `src/actions/auth.ts`**

Replace the local `normalizeEmail` function body with an import from utils:
```typescript
import { normalizeEmail } from '@/lib/utils'
```
Remove the local `normalizeEmail` function definition.

- [ ] **Step 9: Update `src/actions/admin.ts`**

Replace the local `normalizeEmail` (which returns `''` for invalid) with import from utils. Update any callers that check `=== null` vs `=== ''` appropriately.

- [ ] **Step 10: Run tests — expect PASS**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm test -- utils.test 2>&1 | tail -20
```
Expected: PASS

- [ ] **Step 11: Run full test suite**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm test 2>&1 | tail -30
```
Expected: all existing tests pass.

- [ ] **Step 12: Commit**

```bash
cd /mnt/sdb/AI/ScoreProphet && git add src/lib/types.ts src/lib/utils.ts src/lib/scoring.ts src/lib/validation.ts src/actions/predictions.ts src/actions/auth.ts src/actions/admin.ts src/lib/__tests__/utils.test.ts && git commit -m "refactor: centralize PredictionType, normalizeEmail, and SCORING constants"
```

---

### Task 2: Database Schema & WAL Mode (PERF-4, Feature 5 schema, WAL)

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `prisma/schema.prisma`
- Create: migration via `npx prisma migrate dev`

- [ ] **Step 1: Enable WAL mode in `src/lib/db.ts`**

Replace the current content:
```typescript
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import Database from 'better-sqlite3'

function createPrismaClient() {
  const url = (process.env.DATABASE_URL ?? 'file:./dev.db').replace(/^file:/, '')
  const db = new Database(url)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  const adapter = new PrismaBetterSqlite3({ url }, db)
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
export const prisma = globalForPrisma.prisma ?? createPrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

Note: Check the PrismaBetterSqlite3 constructor signature first — it may accept a pre-created Database instance as second arg, or may need the `url` string. If it doesn't accept a pre-created instance, use:
```typescript
const adapter = new PrismaBetterSqlite3({ url })
// Then set pragmas via $executeRawUnsafe after creation
```
In that case, the pragmas must be set at application startup via a one-time call. The simplest approach: open a temporary Database instance solely to set pragmas, then close it before creating the adapter (SQLite pragmas persist on the file).

- [ ] **Step 2: Add Prediction index and AdminAuditLog to `prisma/schema.prisma`**

Add index to Prediction model:
```prisma
model Prediction {
  // ... existing fields ...
  @@unique([userId, matchId, type, championshipId])
  @@index([matchId, championshipId])
}
```

Add AdminAuditLog model (append to schema):
```prisma
model AdminAuditLog {
  id             Int      @id @default(autoincrement())
  adminId        Int
  adminUsername  String
  action         String
  entityType     String?
  entityId       String?
  details        String?
  createdAt      DateTime @default(now())

  @@index([adminId])
  @@index([createdAt])
}
```

- [ ] **Step 3: Create and apply migration**

```bash
cd /mnt/sdb/AI/ScoreProphet && npx prisma migrate dev --name add_audit_log_and_prediction_index 2>&1 | tail -20
```
Expected: migration created and applied, Prisma client regenerated.

- [ ] **Step 4: Verify schema generates clean client**

```bash
cd /mnt/sdb/AI/ScoreProphet && npx prisma generate 2>&1 | tail -10
```
Expected: "Generated Prisma Client"

- [ ] **Step 5: Run full test suite**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm test 2>&1 | tail -20
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
cd /mnt/sdb/AI/ScoreProphet && git add src/lib/db.ts prisma/schema.prisma prisma/migrations/ && git commit -m "perf: enable WAL mode, add Prediction index, add AdminAuditLog schema"
```

---

### Task 3: Security — Auth & App URL (CRIT-02, CRIT-03, HIGH-03, MED-01, MED-05)

**Files:**
- Modify: `src/lib/app-url.ts`
- Modify: `src/lib/auth.ts`
- Modify: `src/actions/auth.ts`
- Test: `src/lib/__tests__/app-url.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/__tests__/app-url.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('getAppUrl', () => {
  const originalEnv = process.env.APP_URL

  afterEach(() => {
    process.env.APP_URL = originalEnv
  })

  it('returns APP_URL with trailing slash stripped', async () => {
    process.env.APP_URL = 'https://example.com/'
    const { getAppUrl } = await import('../app-url')
    expect(await getAppUrl()).toBe('https://example.com')
  })

  it('throws when APP_URL is not set', async () => {
    delete process.env.APP_URL
    // Must re-import to avoid module cache
    const mod = await import('../app-url?bust=' + Date.now())
    await expect(mod.getAppUrl()).rejects.toThrow('APP_URL')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL (second case passes currently but wrong reason)**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm test -- app-url.test 2>&1 | tail -20
```

- [ ] **Step 3: Fix `src/lib/app-url.ts` — require APP_URL**

Replace entire file:
```typescript
export async function getAppUrl(): Promise<string> {
  const url = process.env.APP_URL
  if (!url) throw new Error('APP_URL environment variable is required')
  return url.replace(/\/$/, '')
}

export function getSafeRedirectPath(value: FormDataEntryValue | string | null): string {
  const path = String(value ?? '').trim()
  if (!path.startsWith('/') || path.startsWith('//')) return '/'
  return path
}
```

- [ ] **Step 4: Fix `src/lib/auth.ts` — DB-verify isAdmin in requireAdmin**

Find `requireAdmin()` and update:
```typescript
export async function requireAdmin() {
  const session = await requireAuth()
  const user = await prisma.user.findUnique({ where: { id: session.userId! }, select: { isAdmin: true } })
  if (!user?.isAdmin) redirect('/')
  return session
}
```

- [ ] **Step 5: Fix `src/actions/auth.ts` — HIGH-03 TOCTOU in resetPassword**

The current code calls `findUnique` outside the transaction, then uses `reset.id` inside. Move the validation check inside the transaction using `updateMany` with the condition embedded, or use a select-then-update within one transaction:

```typescript
export async function resetPassword(prevState: unknown, formData: FormData) {
  const token = (formData.get('token') as string)?.trim()
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (!token) return { error: 'Password reset link is missing or invalid' }
  if (!password || password.length < 8) return { error: 'Password must be at least 8 characters' }
  if (password !== confirmPassword) return { error: 'Passwords do not match' }

  const tokenHash = hashToken(token)
  const now = new Date()

  const result = await prisma.$transaction(async (tx) => {
    const reset = await tx.passwordResetToken.findUnique({ where: { tokenHash } })
    if (!reset || reset.usedAt || reset.expiresAt <= now) return null

    const [updatedUser] = await Promise.all([
      tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash: await hashPassword(password) },
      }),
      tx.passwordResetToken.update({
        where: { id: reset.id },
        data: { usedAt: now },
      }),
      tx.passwordResetToken.deleteMany({
        where: { userId: reset.userId, id: { not: reset.id }, usedAt: null },
      }),
    ])
    return updatedUser
  })

  if (!result) return { error: 'Password reset link has expired' }
  return { success: true }
}
```

- [ ] **Step 6: Fix MED-05 — increase password minimum to 8 chars**

In `src/actions/auth.ts`, update all password length checks:
- `register`: `password.length < 8`
- `changePassword` (newPassword): `newPassword.length < 8`
- Error messages: "Password must be at least 8 characters"

- [ ] **Step 7: Fix MED-01 — invalidate session on password change**

In `changePassword` in `src/actions/auth.ts`, after the DB update, destroy the current session:
```typescript
await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } })
const session = await getSession()
session.destroy()
return { success: true }
```

- [ ] **Step 8: Fix requestPasswordReset — delete existing unused tokens before creating new one**

```typescript
// Inside the `if (user)` block, before creating the new token:
await prisma.passwordResetToken.deleteMany({
  where: { userId: user.id, usedAt: null },
})
const token = crypto.randomBytes(32).toString('base64url')
await prisma.passwordResetToken.create({ ... })
```

- [ ] **Step 9: Run tests**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm test 2>&1 | tail -30
```
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
cd /mnt/sdb/AI/ScoreProphet && git add src/lib/app-url.ts src/lib/auth.ts src/actions/auth.ts src/lib/__tests__/app-url.test.ts && git commit -m "security: require APP_URL, DB-verify isAdmin, fix TOCTOU in resetPassword, invalidate session on pw change, min pw 8 chars"
```

---

### Task 4: Security — Rate Limiting (CRIT-01)

**Files:**
- Create: `src/lib/rate-limit.ts`
- Modify: `src/actions/auth.ts`
- Test: `src/lib/__tests__/rate-limit.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/__tests__/rate-limit.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { checkRateLimit, RateLimitStore } from '../rate-limit'

describe('checkRateLimit', () => {
  let store: RateLimitStore

  beforeEach(() => {
    store = new RateLimitStore()
    vi.useFakeTimers()
  })

  it('allows requests under the limit', () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(store, '1.2.3.4:login', 5, 60_000)).toBe(true)
    }
  })

  it('blocks the 6th request within the window', () => {
    for (let i = 0; i < 5; i++) checkRateLimit(store, '1.2.3.4:login', 5, 60_000)
    expect(checkRateLimit(store, '1.2.3.4:login', 5, 60_000)).toBe(false)
  })

  it('resets after window expires', () => {
    for (let i = 0; i < 5; i++) checkRateLimit(store, '1.2.3.4:login', 5, 60_000)
    vi.advanceTimersByTime(61_000)
    expect(checkRateLimit(store, '1.2.3.4:login', 5, 60_000)).toBe(true)
  })

  it('treats different keys independently', () => {
    for (let i = 0; i < 5; i++) checkRateLimit(store, '1.2.3.4:login', 5, 60_000)
    expect(checkRateLimit(store, '5.6.7.8:login', 5, 60_000)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm test -- rate-limit.test 2>&1 | tail -20
```

- [ ] **Step 3: Create `src/lib/rate-limit.ts`**

```typescript
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

// Singleton stores (in-process, resets on restart)
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
```

- [ ] **Step 4: Apply rate limiting in `src/actions/auth.ts`**

Import at top:
```typescript
import { rateLimitLogin, rateLimitRegister, rateLimitResetRequest, rateLimitResetExecute } from '@/lib/rate-limit'
```

In `register` (first line of function body):
```typescript
if (!await rateLimitRegister()) return { error: 'Too many registration attempts. Try again later.' }
```

In `login` (first line of function body):
```typescript
if (!await rateLimitLogin()) return { error: 'Too many login attempts. Try again in 5 minutes.' }
```

In `requestPasswordReset` (first line of function body):
```typescript
if (!await rateLimitResetRequest()) return { success: true } // silent rate limit to avoid enumeration
```

In `resetPassword` (after token validation, before DB work):
```typescript
if (!await rateLimitResetExecute()) return { error: 'Too many attempts. Try again later.' }
```

- [ ] **Step 5: Run tests**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm test 2>&1 | tail -30
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
cd /mnt/sdb/AI/ScoreProphet && git add src/lib/rate-limit.ts src/actions/auth.ts src/lib/__tests__/rate-limit.test.ts && git commit -m "security: add in-memory rate limiting to login, register, and password reset endpoints"
```

---

### Task 5: Security — HTTP Headers & Email SSRF (HIGH-02, HIGH-01, MED-02, PERF-5)

**Files:**
- Create: `next.config.ts` (or modify existing `next.config.js` if present)
- Modify: `src/lib/email.ts`

- [ ] **Step 1: Check for existing next.config file**

```bash
ls /mnt/sdb/AI/ScoreProphet/next.config* 2>/dev/null
```

- [ ] **Step 2: Create/update `next.config.ts` with security headers**

```typescript
import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",  // needed for Next.js inline scripts
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: crests.football-data.org media.api-sports.io upload.wikimedia.org",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
```

- [ ] **Step 3: Fix HIGH-01 SSRF in `src/lib/email.ts` — add hostname allowlist**

Find `crestToDataUri` and add hostname validation:

```typescript
const ALLOWED_CREST_HOSTS = new Set([
  'crests.football-data.org',
  'media.api-sports.io',
  'upload.wikimedia.org',
  'flags.fmcdn.net',
])

const MAX_CREST_BYTES = 512 * 1024 // 512 KB

async function crestToDataUri(url: string | undefined): Promise<string | null> {
  if (!url || !url.startsWith('https://')) return null  // require HTTPS
  let parsed: URL
  try { parsed = new URL(url) } catch { return null }
  if (!ALLOWED_CREST_HOSTS.has(parsed.hostname)) return null
  if (crestCache.has(url)) return crestCache.get(url)!
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const contentLength = Number(res.headers.get('content-length') ?? '0')
    if (contentLength > MAX_CREST_BYTES) return null
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('svg') || url.toLowerCase().endsWith('.svg')) {
      const svg = await res.text()
      if (svg.length > MAX_CREST_BYTES) return null
      const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 56 } })
      const png = resvg.render().asPng()
      const uri = `data:image/png;base64,${Buffer.from(png).toString('base64')}`
      if (crestCache.size < 500) crestCache.set(url, uri)
      return uri
    }
    if (contentType.includes('png') || contentType.includes('jpeg')) {
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length > MAX_CREST_BYTES) return null
      const mime = contentType.includes('jpeg') ? 'image/jpeg' : 'image/png'
      const uri = `data:${mime};base64,${buf.toString('base64')}`
      if (crestCache.size < 500) crestCache.set(url, uri)
      return uri
    }
  } catch {
    // network or conversion failure
  }
  return null
}
```

- [ ] **Step 4: Fix MED-02 — add requireTLS to SMTP transporter**

In `createTransporter()`:
```typescript
return nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  requireTLS: port !== 465,  // STARTTLS for port 587
  auth: { user, pass },
})
```

- [ ] **Step 5: Run full test suite**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm test 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
cd /mnt/sdb/AI/ScoreProphet && git add next.config.ts src/lib/email.ts && git commit -m "security: add HTTP security headers, SSRF hostname allowlist, response size cap, SMTP requireTLS"
```

---

### Task 6: Security — Session, Invites & Redirects (MED-04, Feature 8, MED-06, OPS-06)

**Files:**
- Modify: `src/lib/session.ts`
- Modify: `src/actions/championships.ts`
- Modify: `src/app/register/page.tsx` (or wherever next= is read)

- [ ] **Step 1: Fix MED-04 — reduce session maxAge from 30 days to 7 days in `src/lib/session.ts`**

Find:
```typescript
maxAge: 60 * 60 * 24 * 30,
```
Replace with:
```typescript
maxAge: 60 * 60 * 24 * 7,
```

- [ ] **Step 2: Fix Feature 8 — add 7-day invite expiry in `src/actions/championships.ts`**

Find `generateChampionshipInvite` (or equivalent). When creating the invite, add:
```typescript
await prisma.championshipInvite.create({
  data: {
    championshipId,
    token: hashToken(rawToken),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  },
})
```

Also update the invite JOIN validation (wherever `championshipInvite.findUnique` is used) to check `expiresAt`:
```typescript
const invite = await prisma.championshipInvite.findUnique({ where: { token: hashToken(rawToken) } })
if (!invite || invite.usedAt || (invite.expiresAt && invite.expiresAt < new Date())) {
  return { error: 'Invite link is invalid or has expired.' }
}
```

- [ ] **Step 3: Fix OPS-06 — verify FOOTBALL_API_KEY at startup**

In `src/lib/football-api.ts`, at module level (outside any function):
```typescript
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY
if (!FOOTBALL_API_KEY && process.env.NODE_ENV === 'production') {
  console.error('[football-api] FOOTBALL_API_KEY is not set — API calls will fail')
}
```
Replace any `process.env.FOOTBALL_API_KEY ?? ''` with the constant.

- [ ] **Step 4: Run tests**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm test 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
cd /mnt/sdb/AI/ScoreProphet && git add src/lib/session.ts src/actions/championships.ts src/lib/football-api.ts && git commit -m "security: 7-day session, 7-day invite expiry, API key startup check"
```

---

### Task 7: Bug Fixes (BUG-1, BUG-2)

**Files:**
- Modify: `src/actions/admin.ts` (BUG-1: winnerTeam)
- Modify: `src/actions/predictions.ts` (BUG-2: type validation)
- Test: `src/lib/__tests__/admin.test.ts` (or existing file)

- [ ] **Step 1: Write test for BUG-2 — prediction type validation**

Add to `src/lib/__tests__/predictions.test.ts` (create if not exists):
```typescript
import { describe, it, expect } from 'vitest'
import { VALID_PREDICTION_TYPES } from '../types'

describe('VALID_PREDICTION_TYPES', () => {
  it('includes the three valid types', () => {
    expect(VALID_PREDICTION_TYPES).toContain('SINGLE_OUTCOME')
    expect(VALID_PREDICTION_TYPES).toContain('DOUBLE_CHANCE')
    expect(VALID_PREDICTION_TYPES).toContain('EXACT_SCORE')
  })

  it('does not include invalid strings', () => {
    expect(VALID_PREDICTION_TYPES).not.toContain('INVALID')
    expect(VALID_PREDICTION_TYPES).not.toContain('')
  })
})
```

- [ ] **Step 2: Add `VALID_PREDICTION_TYPES` to `src/lib/types.ts`**

```typescript
export const VALID_PREDICTION_TYPES = ['SINGLE_OUTCOME', 'DOUBLE_CHANCE', 'EXACT_SCORE'] as const
export type PredictionType = typeof VALID_PREDICTION_TYPES[number]
```

- [ ] **Step 3: Fix BUG-2 in `src/actions/predictions.ts` — validate type at runtime**

Find where prediction type is cast (likely `type as PredictionType`). Replace with:
```typescript
import { VALID_PREDICTION_TYPES } from '@/lib/types'
// ...
const type = formData.get('type') as string
if (!VALID_PREDICTION_TYPES.includes(type as PredictionType)) {
  return { error: 'Invalid prediction type' }
}
```

- [ ] **Step 4: Fix BUG-1 in `src/actions/admin.ts` — derive winnerTeam in syncMatchesFromApi**

Find where match data is written to the database. Locate where `status` is set to `'FINISHED'`. Add `winnerTeam` derivation from the API data:

```typescript
// The football-data.org API returns score.winner as: 'HOME_TEAM', 'AWAY_TEAM', 'DRAW', or null
function deriveWinnerTeam(
  apiStatus: string,
  winner: string | null,
  homeScore: number,
  awayScore: number,
): string | null {
  if (apiStatus !== 'FINISHED' && apiStatus !== 'TIMED' && apiStatus !== 'AWARDED') return null
  if (winner === 'HOME_TEAM' || winner === 'AWAY_TEAM' || winner === 'DRAW') return winner
  // Fallback: derive from scores
  if (homeScore > awayScore) return 'HOME_TEAM'
  if (awayScore > homeScore) return 'AWAY_TEAM'
  return 'DRAW'
}
```

When creating/updating a match record, call:
```typescript
winnerTeam: deriveWinnerTeam(apiMatch.status, apiMatch.score?.winner ?? null, homeScore, awayScore),
```

- [ ] **Step 5: Run tests**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm test 2>&1 | tail -30
```

- [ ] **Step 6: Commit**

```bash
cd /mnt/sdb/AI/ScoreProphet && git add src/lib/types.ts src/actions/predictions.ts src/actions/admin.ts src/lib/__tests__/predictions.test.ts && git commit -m "fix: validate prediction type at runtime, derive winnerTeam in syncMatchesFromApi"
```

---

### Task 8: Performance — Admin Sync & Scoring (PERF-1, PERF-2, PERF-6)

**Files:**
- Modify: `src/actions/admin.ts`
- Modify: `src/lib/football-api.ts`

- [ ] **Step 1: Fix PERF-6 — fetchTeamById in `src/lib/football-api.ts`**

If the API supports fetching a single team by ID, update `fetchTeamById` to call that endpoint directly instead of fetching all teams and using `.find()`:
```typescript
export async function fetchTeamById(id: number): Promise<ApiTeam | null> {
  const res = await fetch(`${API_BASE}/teams/${id}`, {
    headers: { 'X-Auth-Token': FOOTBALL_API_KEY ?? '' },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.team ?? null
}
```

If the API doesn't support single-team fetch, at minimum cache the full teams list in memory so multiple calls reuse the same data:
```typescript
let teamsCache: ApiTeam[] | null = null
let teamsCacheExpiry = 0

export async function fetchAllTeams(): Promise<ApiTeam[]> {
  if (teamsCache && Date.now() < teamsCacheExpiry) return teamsCache
  // ... fetch ...
  teamsCache = teams
  teamsCacheExpiry = Date.now() + 60 * 60_000 // 1-hour cache
  return teams
}
```

- [ ] **Step 2: Fix PERF-1 — H2H freshness check in `src/actions/admin.ts`**

Find where H2H data is fetched unconditionally. Add a freshness gate — only fetch H2H for a match if it hasn't been fetched in the last hour, or if the match status just changed to FINISHED:

```typescript
// Only fetch H2H if match is finished and H2H not already populated
const matchesNeedingH2H = finishedMatches.filter(m => !m.h2hFetched || m.h2hFetchedAt < new Date(Date.now() - 60 * 60_000))
// If h2hFetched/h2hFetchedAt doesn't exist as a field, track it via a Set of already-processed matchIds during the sync run
const processedH2HIds = new Set<number>()
for (const match of finishedMatches) {
  if (processedH2HIds.has(match.id)) continue
  processedH2HIds.add(match.id)
  // fetch H2H
}
```

Note: If the schema doesn't have an `h2hFetchedAt` column, the simplest fix is to skip H2H fetches for matches already in FINISHED status from a previous sync (i.e., only fetch H2H for matches that transitioned to FINISHED in THIS sync run).

- [ ] **Step 3: Fix PERF-2 — batch recalculate in `src/actions/admin.ts`**

Find `recalculateMatchPoints` or equivalent. Instead of N individual `UPDATE` queries, collect all updates and use a transaction:

```typescript
await prisma.$transaction(
  userMatchResults.map(({ userId, matchId, championshipId, points }) =>
    prisma.prediction.updateMany({
      where: { userId, matchId, championshipId },
      data: { points },
    })
  )
)
```

Or if the schema has a separate score record, batch it there. The key is replacing a loop of `await prisma.X.update(...)` calls with a single `$transaction([...])`.

- [ ] **Step 4: Run tests**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm test 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
cd /mnt/sdb/AI/ScoreProphet && git add src/actions/admin.ts src/lib/football-api.ts && git commit -m "perf: cache teams list, skip redundant H2H fetches, batch point recalculation in transaction"
```

---

### Task 9: Performance — Reminder Loop (PERF-3)

**Files:**
- Modify: `src/lib/prediction-reminders.ts`
- Test: `src/lib/__tests__/prediction-reminders.test.ts`

- [ ] **Step 1: Analyze current N+1 pattern**

The current loop does per-user per-match per-championship:
1. `findUnique` for existing reminder
2. `findMany` for predictions
3. `findUnique` for knockoutAdvance

This is 3 queries × N users × M matches = O(N×M) queries.

- [ ] **Step 2: Rewrite to batch queries**

Replace the inner loop with batch lookups:

```typescript
export async function sendDuePredictionReminders(appUrl: string, now = new Date()) {
  const normalizedAppUrl = appUrl.replace(/\/$/, '')
  const window = predictionReminderWindow(now)

  const [matches, championships] = await Promise.all([
    prisma.match.findMany({
      where: { status: 'SCHEDULED', kickoff: window },
      orderBy: { kickoff: 'asc' },
    }),
    prisma.championship.findMany({
      where: { isActive: true },
      select: { id: true, name: true, doubleChanceEnabled: true },
    }),
  ])

  if (matches.length === 0) return { matchesChecked: 0, sent: 0 }

  const matchIds = matches.map(m => m.id)
  let sent = 0

  for (const championship of championships) {
    const members = await prisma.championshipMember.findMany({
      where: {
        championshipId: championship.id,
        user: { predictionReminderEnabled: true, email: { not: null } },
      },
      include: { user: true },
    })
    if (members.length === 0) continue

    const userIds = members.map(m => m.userId)

    // Batch fetch all existing reminders for this championship × match set
    const existingReminders = await prisma.predictionReminder.findMany({
      where: { championshipId: championship.id, matchId: { in: matchIds }, userId: { in: userIds } },
      select: { userId: true, matchId: true },
    })
    const reminderSet = new Set(existingReminders.map(r => `${r.userId}:${r.matchId}`))

    // Batch fetch all predictions for this championship × match set
    const allPredictions = await prisma.prediction.findMany({
      where: { championshipId: championship.id, matchId: { in: matchIds }, userId: { in: userIds } },
      select: { userId: true, matchId: true, type: true },
    })
    const predsByKey = new Map<string, typeof allPredictions>()
    for (const p of allPredictions) {
      const key = `${p.userId}:${p.matchId}`
      const arr = predsByKey.get(key) ?? []
      arr.push(p)
      predsByKey.set(key, arr)
    }

    // Batch fetch all knockout advances
    const allAdvances = await prisma.knockoutAdvance.findMany({
      where: { championshipId: championship.id, matchId: { in: matchIds }, userId: { in: userIds } },
      select: { userId: true, matchId: true },
    })
    const advanceSet = new Set(allAdvances.map(a => `${a.userId}:${a.matchId}`))

    for (const match of matches) {
      for (const member of members) {
        if (!member.user.email) continue
        const key = `${member.userId}:${match.id}`
        if (reminderSet.has(key)) continue

        const predictions = predsByKey.get(key) ?? []
        const hasAdvance = advanceSet.has(key)

        if (arePredictionsConfigured(match, predictions, hasAdvance, championship.doubleChanceEnabled)) continue

        await sendPredictionReminderEmail(
          member.user.email,
          {
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            homeTeamCrest: match.homeTeamCrest || undefined,
            awayTeamCrest: match.awayTeamCrest || undefined,
            kickoffLabel: formatMatchTime(match.kickoff, member.user.timezone),
            stageLabel: stageLabel(match.stage),
            championshipName: championship.name,
          },
          `${normalizedAppUrl}/championships/${member.championshipId}/predictions`
        )

        await prisma.predictionReminder.create({
          data: { userId: member.userId, matchId: match.id, championshipId: member.championshipId },
        })
        reminderSet.add(key) // prevent duplicate within same run
        sent++
      }
    }
  }

  return { matchesChecked: matches.length, sent }
}
```

- [ ] **Step 3: Run tests**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm test 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
cd /mnt/sdb/AI/ScoreProphet && git add src/lib/prediction-reminders.ts && git commit -m "perf: batch reminder loop queries — O(championships) instead of O(users×matches)"
```

---

### Task 10: DEBT-1 — Shared Email Script Module

**Files:**
- Modify: `scripts/send-prediction-reminders.mjs`
- Note: The email rendering logic in this script duplicates `src/lib/email.ts`. Since the script runs as a standalone ESM file (not via Next.js build), it cannot import TypeScript source directly. The cleanest fix is to document this debt and ensure both implementations stay in sync by extracting a shared JSON-based template rather than full deduplication, OR compile the script to use the built output.

- [ ] **Step 1: Assess the scripts/send-prediction-reminders.mjs usage**

```bash
cat /mnt/sdb/AI/ScoreProphet/entrypoint.sh | grep -A5 send-prediction
```

If the script is called from entrypoint.sh as a standalone node process, it cannot import TypeScript. Options:
1. Use the compiled Next.js standalone output (`.next/standalone`)
2. Keep both in sync via JSDoc and a comment header
3. Create a shared `scripts/lib/email-template.mjs` that both import

- [ ] **Step 2: Create `scripts/lib/email-template.mjs`**

Extract the HTML builder and crest fetcher into a shared module:
```javascript
// scripts/lib/email-template.mjs
// Shared email template logic — also maintained in src/lib/email.ts (TypeScript version)
import { Resvg } from '@resvg/resvg-js'

const ALLOWED_CREST_HOSTS = new Set([
  'crests.football-data.org',
  'media.api-sports.io',
  'upload.wikimedia.org',
  'flags.fmcdn.net',
])
const MAX_CREST_BYTES = 512 * 1024
const crestCache = new Map()

export async function crestToDataUri(url) {
  if (!url || !url.startsWith('https://')) return null
  let parsed
  try { parsed = new URL(url) } catch { return null }
  if (!ALLOWED_CREST_HOSTS.has(parsed.hostname)) return null
  if (crestCache.has(url)) return crestCache.get(url)
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('svg') || url.toLowerCase().endsWith('.svg')) {
      const svg = await res.text()
      if (svg.length > MAX_CREST_BYTES) return null
      const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 56 } })
      const png = resvg.render().asPng()
      const uri = `data:image/png;base64,${Buffer.from(png).toString('base64')}`
      if (crestCache.size < 500) crestCache.set(url, uri)
      return uri
    }
    if (contentType.includes('png') || contentType.includes('jpeg')) {
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length > MAX_CREST_BYTES) return null
      const mime = contentType.includes('jpeg') ? 'image/jpeg' : 'image/png'
      const uri = `data:${mime};base64,${buf.toString('base64')}`
      if (crestCache.size < 500) crestCache.set(url, uri)
      return uri
    }
  } catch {}
  return null
}

export function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function crestImg(dataUri, teamName) {
  if (!dataUri) return ''
  return `<img src="${dataUri}" width="48" height="48" alt="${escapeHtml(teamName)}" style="display:block;margin:0 auto 10px;max-width:48px;height:48px;object-fit:contain;">`
}

export function buildReminderHtml(match, predictionsUrl, homeCrest, awayCrest) {
  // ... same HTML as in src/lib/email.ts ...
  // Copy the full HTML template here
}
```

- [ ] **Step 3: Update `scripts/send-prediction-reminders.mjs` to import shared module**

Replace duplicated functions with imports:
```javascript
import { crestToDataUri, escapeHtml, buildReminderHtml } from './lib/email-template.mjs'
```
Remove the now-redundant local `crestToDataUri`, `escapeHtml`, `crestImg`, `buildReminderHtml` functions.

- [ ] **Step 4: Run the script in dry-run mode to verify it loads**

```bash
cd /mnt/sdb/AI/ScoreProphet && node --input-type=module --eval "import './scripts/send-prediction-reminders.mjs'" 2>&1 | head -20
```
Expected: No syntax errors (will fail on DB connection, which is fine).

- [ ] **Step 5: Commit**

```bash
cd /mnt/sdb/AI/ScoreProphet && git add scripts/lib/ scripts/send-prediction-reminders.mjs && git commit -m "refactor: extract shared email template to scripts/lib/email-template.mjs"
```

---

### Task 11: Feature 4 — Multiple Live Matches

**Files:**
- Modify: `src/lib/football-api.ts`
- Modify: `src/app/live/page.tsx`
- Test: `src/lib/__tests__/football-api.test.ts`

- [ ] **Step 1: Add failing test for fetchLiveMatches**

In `src/lib/__tests__/football-api.test.ts`, add:
```typescript
describe('fetchLiveMatches', () => {
  it('returns all in-play matches, not just the first', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        matches: [
          { id: 1, status: 'IN_PLAY', homeTeam: { id: 10, name: 'A', crest: null }, awayTeam: { id: 11, name: 'B', crest: null }, score: { fullTime: { home: 1, away: 0 }, winner: null }, stage: 'GROUP', utcDate: '2026-06-01T18:00:00Z', competition: { name: 'Test', code: 'TEST' } },
          { id: 2, status: 'IN_PLAY', homeTeam: { id: 12, name: 'C', crest: null }, awayTeam: { id: 13, name: 'D', crest: null }, score: { fullTime: { home: 0, away: 0 }, winner: null }, stage: 'GROUP', utcDate: '2026-06-01T18:00:00Z', competition: { name: 'Test', code: 'TEST' } },
        ]
      }),
    } as Response)
    const { fetchLiveMatches } = await import('../football-api')
    const result = await fetchLiveMatches()
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe(1)
    expect(result[1].id).toBe(2)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm test -- football-api.test 2>&1 | tail -20
```

- [ ] **Step 3: Add `fetchLiveMatches` to `src/lib/football-api.ts`**

```typescript
export async function fetchLiveMatches(): Promise<NormalizedMatch[]> {
  const competitionCode = process.env.FOOTBALL_COMPETITION_CODE ?? 'WC'
  const res = await fetch(
    `${API_BASE}/competitions/${competitionCode}/matches?status=IN_PLAY,PAUSED`,
    { headers: { 'X-Auth-Token': FOOTBALL_API_KEY ?? '' }, next: { revalidate: 60 } }
  )
  if (!res.ok) return []
  const data = await res.json()
  return (data.matches ?? []).map(normalizeMatch)
}
```

Keep `fetchLiveMatch` for backward compat (it can call `fetchLiveMatches()[0] ?? null`), or remove if no other callers.

- [ ] **Step 4: Update `src/app/live/page.tsx`**

Replace `fetchLiveMatch()` call with `fetchLiveMatches()` and render all matches:
```tsx
const matches = await fetchLiveMatches()

if (matches.length === 0) {
  return <div>No live matches right now.</div>
}

return (
  <div>
    {matches.map(match => (
      <LiveMatchCard key={match.id} match={match} />
    ))}
  </div>
)
```

If the current page renders a single match inline (no card component), wrap the rendering in a `matches.map(...)`.

- [ ] **Step 5: Run tests**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm test 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
cd /mnt/sdb/AI/ScoreProphet && git add src/lib/football-api.ts src/app/live/page.tsx src/lib/__tests__/football-api.test.ts && git commit -m "feat: return all live matches instead of only the first one"
```

---

### Task 12: Feature 3 — H2H Tiebreaker in Group Standings

**Files:**
- Modify: `src/lib/standings.ts`
- Test: `src/lib/__tests__/standings.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/lib/__tests__/standings.test.ts`:
```typescript
describe('H2H tiebreaker', () => {
  it('uses H2H points to break ties before GD', () => {
    // Two teams equal on pts, GD, GF — H2H result decides
    const matches = [
      finishedMatch({ homeTeam: 'A', awayTeam: 'B', homeScore: 1, awayScore: 0 }), // A beats B
      finishedMatch({ homeTeam: 'B', awayTeam: 'C', homeScore: 1, awayScore: 0 }),
      finishedMatch({ homeTeam: 'C', awayTeam: 'A', homeScore: 0, awayScore: 1 }), // A beats C
      finishedMatch({ homeTeam: 'D', awayTeam: 'A', homeScore: 0, awayScore: 1 }),
      finishedMatch({ homeTeam: 'D', awayTeam: 'B', homeScore: 0, awayScore: 1 }),
      finishedMatch({ homeTeam: 'D', awayTeam: 'C', homeScore: 0, awayScore: 1 }),
    ]
    const rows = computeGroupStandings('X', matches)
    // A should be 1st (beat both B and C), B should be 2nd (beat C), C should be 3rd
    expect(rows[0].team).toBe('A')
    expect(rows[1].team).toBe('B')
    expect(rows[2].team).toBe('C')
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm test -- standings.test 2>&1 | tail -20
```

- [ ] **Step 3: Add H2H helpers to `src/lib/standings.ts`**

```typescript
interface H2HRecord {
  pts: number
  gd: number
  gf: number
}

function computeH2HRecords(
  teams: string[],
  matches: Match[],
): Map<string, Map<string, H2HRecord>> {
  const records = new Map<string, Map<string, H2HRecord>>()
  for (const t of teams) records.set(t, new Map())

  for (const m of matches) {
    if (m.status !== 'FINISHED') continue
    const home = m.homeTeam, away = m.awayTeam
    if (!teams.includes(home) || !teams.includes(away)) continue

    const hg = m.homeScore ?? 0, ag = m.awayScore ?? 0
    const homeRec = records.get(home)!
    const awayRec = records.get(away)!

    const existing_h = homeRec.get(away) ?? { pts: 0, gd: 0, gf: 0 }
    const existing_a = awayRec.get(home) ?? { pts: 0, gd: 0, gf: 0 }

    const homePts = hg > ag ? 3 : hg === ag ? 1 : 0
    const awayPts = ag > hg ? 3 : ag === hg ? 1 : 0

    homeRec.set(away, { pts: existing_h.pts + homePts, gd: existing_h.gd + (hg - ag), gf: existing_h.gf + hg })
    awayRec.set(home, { pts: existing_a.pts + awayPts, gd: existing_a.gd + (ag - hg), gf: existing_a.gf + ag })
  }
  return records
}

function h2hPts(a: string, b: string, records: Map<string, Map<string, H2HRecord>>): number {
  return records.get(a)?.get(b)?.pts ?? 0
}
function h2hGd(a: string, b: string, records: Map<string, Map<string, H2HRecord>>): number {
  return records.get(a)?.get(b)?.gd ?? 0
}
function h2hGf(a: string, b: string, records: Map<string, Map<string, H2HRecord>>): number {
  return records.get(a)?.get(b)?.gf ?? 0
}
```

- [ ] **Step 4: Update `compareRows` in `src/lib/standings.ts` to apply H2H**

The current comparator is called with two rows and doesn't have access to matches. Restructure `computeGroupStandings` to compute H2H records once, then use them in a closure:

```typescript
export function computeGroupStandings(group: string, matches: Match[]): StandingRow[] {
  // ... existing accumulation logic ...

  const teams = rows.map(r => r.team)
  const h2h = computeH2HRecords(teams, matches)

  rows.sort((a, b) => {
    // 1. Overall points
    if (b.pts !== a.pts) return b.pts - a.pts
    // 2. H2H points between tied teams (only applies when exactly 2 teams tied)
    const h2hPtsA = h2hPts(a.team, b.team, h2h)
    const h2hPtsB = h2hPts(b.team, a.team, h2h)
    if (h2hPtsA !== h2hPtsB) return h2hPtsB - h2hPtsA
    // 3. H2H GD
    const h2hGdA = h2hGd(a.team, b.team, h2h)
    const h2hGdB = h2hGd(b.team, a.team, h2h)
    if (h2hGdA !== h2hGdB) return h2hGdB - h2hGdA
    // 4. H2H GF
    const h2hGfA = h2hGf(a.team, b.team, h2h)
    const h2hGfB = h2hGf(b.team, a.team, h2h)
    if (h2hGfA !== h2hGfB) return h2hGfB - h2hGfA
    // 5. Overall GD
    if (b.gd !== a.gd) return b.gd - a.gd
    // 6. Overall GF
    if (b.gf !== a.gf) return b.gf - a.gf
    // 7. Alphabetical
    return a.team.localeCompare(b.team)
  })

  return rows
}
```

- [ ] **Step 5: Run tests**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm test -- standings.test 2>&1 | tail -30
```
Expected: all pass including new H2H test.

- [ ] **Step 6: Commit**

```bash
cd /mnt/sdb/AI/ScoreProphet && git add src/lib/standings.ts src/lib/__tests__/standings.test.ts && git commit -m "feat: H2H tiebreaker in group standings (FIFA standard: H2H pts → H2H GD → H2H GF → overall GD → overall GF)"
```

---

### Task 13: Feature 1 — Reveal Predictions for Live Matches

**Files:**
- Modify: `src/app/championships/[championshipId]/results/page.tsx`

- [ ] **Step 1: Read the results page to confirm the exact query**

```bash
grep -n "status" /mnt/sdb/AI/ScoreProphet/src/app/championships/*/results/page.tsx
```

- [ ] **Step 2: Add LIVE to the status filter**

Find the match query filter. Currently:
```typescript
where: { status: 'FINISHED', ... }
```

Replace with:
```typescript
where: { status: { in: ['FINISHED', 'LIVE'] }, ... }
```

If the page uses a different status field name (e.g. `'IN_PLAY'`), check the Prisma enum and use the correct value. In the schema the status is likely `'LIVE'` based on the codebase, but verify with:
```bash
grep -r "LIVE\|IN_PLAY" /mnt/sdb/AI/ScoreProphet/prisma/schema.prisma
```

- [ ] **Step 3: Add a visual indicator for live matches in the results UI**

In the results page or component, where match status is rendered, add a "LIVE" badge:
```tsx
{match.status === 'LIVE' && (
  <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">● Live</span>
)}
```

- [ ] **Step 4: Run tests**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm test 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
cd /mnt/sdb/AI/ScoreProphet && git add src/app/championships/ && git commit -m "feat: reveal all participants' predictions for live matches in results page"
```

---

### Task 14: Feature 5 — Admin Audit Log

**Files:**
- Create: `src/lib/audit.ts`
- Modify: `src/actions/admin.ts`
- Modify: `src/app/admin/page.tsx` (or admin client component)
- Test: `src/lib/__tests__/audit.test.ts`

- [ ] **Step 1: Create `src/lib/audit.ts`**

```typescript
import { prisma } from '@/lib/db'

export type AuditAction =
  | 'SYNC_MATCHES'
  | 'RECALCULATE_POINTS'
  | 'UPDATE_MATCH'
  | 'DELETE_USER'
  | 'UPDATE_CHAMPIONSHIP'
  | 'CREATE_CHAMPIONSHIP'
  | 'DELETE_CHAMPIONSHIP'
  | 'REMOVE_MEMBER'
  | 'GENERATE_INVITE'

export async function logAdminAction(params: {
  adminId: number
  adminUsername: string
  action: AuditAction
  entityType?: string
  entityId?: string
  details?: string
}): Promise<void> {
  await prisma.adminAuditLog.create({ data: params }).catch((err) => {
    console.error('[audit] Failed to write audit log:', err)
  })
}
```

- [ ] **Step 2: Add audit logging to admin actions in `src/actions/admin.ts`**

Import `logAdminAction` and add calls after significant mutations. Examples:

After `syncMatchesFromApi` completes:
```typescript
await logAdminAction({
  adminId: session.userId!,
  adminUsername: session.username!,
  action: 'SYNC_MATCHES',
  details: `Synced ${syncedCount} matches`,
})
```

After `recalculateMatchPoints`:
```typescript
await logAdminAction({
  adminId: session.userId!,
  adminUsername: session.username!,
  action: 'RECALCULATE_POINTS',
  entityType: 'match',
  entityId: String(matchId),
})
```

Add similar calls for any other admin mutations (championship edits, user management, etc.).

- [ ] **Step 3: Add audit log section to admin page**

In `src/app/admin/page.tsx`, fetch recent audit entries:
```typescript
const recentAuditLogs = await prisma.adminAuditLog.findMany({
  orderBy: { createdAt: 'desc' },
  take: 50,
})
```

Pass to the admin client component and render:
```tsx
<section>
  <h2>Admin Audit Log</h2>
  <table>
    <thead>
      <tr>
        <th>Time</th><th>Admin</th><th>Action</th><th>Entity</th><th>Details</th>
      </tr>
    </thead>
    <tbody>
      {recentAuditLogs.map(log => (
        <tr key={log.id}>
          <td>{log.createdAt.toISOString()}</td>
          <td>{log.adminUsername}</td>
          <td>{log.action}</td>
          <td>{log.entityType ? `${log.entityType}:${log.entityId}` : '—'}</td>
          <td>{log.details ?? '—'}</td>
        </tr>
      ))}
    </tbody>
  </table>
</section>
```

- [ ] **Step 4: Run full test suite**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm test 2>&1 | tail -30
```
Expected: all pass.

- [ ] **Step 5: Final commit**

```bash
cd /mnt/sdb/AI/ScoreProphet && git add src/lib/audit.ts src/actions/admin.ts src/app/admin/ && git commit -m "feat: admin audit log — tracks sync, recalculate, and other admin mutations"
```

---

## Self-Review

### Spec coverage check

| Requirement | Task |
|-------------|------|
| BUG-1: winnerTeam never set | Task 7 |
| BUG-2: prediction type not validated | Task 7 |
| BUG-3: JSDoc says max 15 but code is 10 | Task 1 |
| CRIT-01: No rate limiting | Task 4 |
| CRIT-02: Host header injection | Task 3 |
| CRIT-03: isAdmin trusted from session | Task 3 |
| HIGH-01: SSRF via crest fetch | Task 5 |
| HIGH-02: No HTTP security headers | Task 5 |
| HIGH-03: TOCTOU in resetPassword | Task 3 |
| MED-01: No session invalidation on pw change | Task 3 |
| MED-02: No requireTLS for SMTP | Task 5 |
| MED-04: 30-day session | Task 6 |
| MED-05: 6-char password min | Task 3 |
| MED-06: SSRF response size | Task 5 |
| OPS-06: API key not checked | Task 6 |
| PERF-1: H2H fetched every sync | Task 8 |
| PERF-2: N individual UPDATE queries | Task 8 |
| PERF-3: N+1 reminder loop | Task 9 |
| PERF-4: Missing Prediction index | Task 2 |
| PERF-5: Unbounded crest cache | Task 5 |
| PERF-6: fetchTeamById fetches all | Task 8 |
| DEBT-1: Email code duplicated | Task 10 |
| DEBT-2: PredictionType redefined 3x | Task 1 |
| DEBT-3: normalizeEmail duplicated | Task 1 |
| DEBT-4: SCORING constants hardcoded | Task 1 |
| Feature 1: Reveal predictions for live | Task 13 |
| Feature 3: H2H tiebreaker | Task 12 |
| Feature 4: All live matches | Task 11 |
| Feature 5: Admin audit log | Task 14 |
| Feature 8: Invite expiry | Task 6 |
| WAL mode | Task 2 |

All requirements covered. No gaps found.

### Type consistency check

- `PredictionType` defined once in `src/lib/types.ts` (Task 1), imported everywhere in Tasks 1, 7
- `SCORING` constants defined in `src/lib/scoring.ts`, no duplication after Task 1
- `normalizeEmail` signature: `(email: string) => string | null` used consistently in Tasks 1, 3
- `logAdminAction` params match `AdminAuditLog` schema fields from Task 2
- `fetchLiveMatches` return type `NormalizedMatch[]` matches existing `NormalizedMatch` type from `football-api.ts`
