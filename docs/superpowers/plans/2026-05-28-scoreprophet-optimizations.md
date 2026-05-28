# ScoreProphet Optimizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 correctness bugs, add 3 DB indexes, improve 3 performance hot-paths, and clean up code quality across 3 waves — each independently committed.

**Architecture:** Three sequential git commits (Wave 1 → Wave 2 → Wave 3). Each wave is independently buildable and testable. Wave 2 requires a Prisma migration. All changes are inside `/mnt/sdb/AI/ScoreProphet/`.

**Tech Stack:** Next.js 15, Prisma 7 + better-sqlite3, iron-session, Vitest, Tailwind CSS, TypeScript, Docker/Alpine

---

## Pre-flight

- Working directory: `/mnt/sdb/AI/ScoreProphet/`
- Run tests before starting: `npm test` — all should pass
- Test command throughout: `npm test`
- Build check: `npm run build` (requires `DATABASE_URL` and `SESSION_SECRET` env vars — use `.env`)

---

## Wave 1 — Correctness

### Task 1: Fix tournament winner lock ignoring competition code

**Files:**
- Modify: `src/actions/predictions.ts`

The functions `saveTournamentWinnerPrediction` and `resetTournamentWinnerPrediction` both query `prisma.match.findFirst({ where: { stage: 'GROUP' } })` without filtering by the championship's `competitionCode`. For a multi-competition setup this locks predictions based on the wrong competition's first match.

- [ ] **Step 1.1: Read the current functions**

Open `src/actions/predictions.ts` and locate `saveTournamentWinnerPrediction` (line ~79) and `resetTournamentWinnerPrediction` (line ~105).

- [ ] **Step 1.2: Fix `saveTournamentWinnerPrediction`**

Replace the parallel `Promise.all` in `saveTournamentWinnerPrediction` with a sequential fetch that first gets the championship's `competitionCode`, then uses it to scope the match query:

```ts
export async function saveTournamentWinnerPrediction(prevState: unknown, formData: FormData) {
  const session = await requireAuth()
  const championshipId = parseInt(formData.get('championshipId') as string, 10)
  const predictedTeam = (formData.get('predictedTeam') as string)?.trim()

  if (!Number.isInteger(championshipId) || championshipId <= 0 || !predictedTeam) {
    return { error: 'Missing fields' }
  }

  const [championship, membership] = await Promise.all([
    prisma.championship.findUnique({
      where: { id: championshipId },
      select: { competitionCode: true },
    }),
    prisma.championshipMember.findFirst({
      where: { userId: session.userId!, championshipId },
    }),
  ])

  if (!membership) return { error: 'You are not a member of this championship' }

  const firstGroupMatch = await prisma.match.findFirst({
    where: { stage: 'GROUP', competitionCode: championship?.competitionCode ?? 'WC' },
    orderBy: { kickoff: 'asc' },
    select: { kickoff: true },
  })

  if (firstGroupMatch && firstGroupMatch.kickoff <= new Date()) {
    return { error: 'Tournament winner prediction is locked' }
  }

  await prisma.tournamentWinnerPrediction.upsert({
    where: { userId_championshipId: { userId: session.userId!, championshipId } },
    update: { predictedTeam },
    create: { userId: session.userId!, championshipId, predictedTeam },
  })

  revalidatePath(`/championships/${championshipId}/predictions`)
  return { success: true }
}
```

- [ ] **Step 1.3: Fix `resetTournamentWinnerPrediction`**

Apply the same pattern — fetch championship and competitionCode first, then scope the match query:

```ts
export async function resetTournamentWinnerPrediction(prevState: unknown, formData: FormData) {
  const session = await requireAuth()
  const championshipId = parseInt(formData.get('championshipId') as string, 10)
  if (!Number.isInteger(championshipId) || championshipId <= 0) return { error: 'Missing fields' }

  const championship = await prisma.championship.findUnique({
    where: { id: championshipId },
    select: { competitionCode: true },
  })

  const firstGroupMatch = await prisma.match.findFirst({
    where: { stage: 'GROUP', competitionCode: championship?.competitionCode ?? 'WC' },
    orderBy: { kickoff: 'asc' },
    select: { kickoff: true },
  })
  if (firstGroupMatch && firstGroupMatch.kickoff <= new Date()) {
    return { error: 'Tournament winner prediction is locked' }
  }

  await prisma.tournamentWinnerPrediction.deleteMany({
    where: { userId: session.userId!, championshipId },
  })

  revalidatePath(`/championships/${championshipId}/predictions`)
  return { success: true }
}
```

- [ ] **Step 1.4: Run tests**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm test
```

Expected: all tests pass (no tests cover these actions directly — runtime correctness only).

---

### Task 2: Scope winner prediction recalculation by competition code

**Files:**
- Modify: `src/actions/admin.ts` — `recalculateMatchPoints`
- Modify: `scripts/sync-scores.mjs` — `recalculateMatchPoints`

Both files fetch ALL `tournamentWinnerPrediction` records when the FINAL is played, ignoring which championship those predictions belong to.

- [ ] **Step 2.1: Fix `src/actions/admin.ts` `recalculateMatchPoints`**

Locate the FINAL block in `recalculateMatchPoints` (around line 60) and add championship scoping:

```ts
  if (match.stage === 'FINAL' && match.winnerTeam) {
    const championships = await prisma.championship.findMany({
      where: { competitionCode: match.competitionCode },
      select: { id: true },
    })
    const championshipIds = championships.map((c) => c.id)
    const winnerPredictions = await prisma.tournamentWinnerPrediction.findMany({
      where: { championshipId: { in: championshipIds } },
    })
    for (const wp of winnerPredictions) {
      const pts = calculateTournamentWinnerPoints(wp.predictedTeam, match.winnerTeam)
      operations.push(
        prisma.tournamentWinnerPrediction.update({ where: { id: wp.id }, data: { pointsAwarded: pts } })
      )
    }
  }
```

- [ ] **Step 2.2: Fix `scripts/sync-scores.mjs` `recalculateMatchPoints`**

Locate the same FINAL block in `scripts/sync-scores.mjs` (around line 52) and apply identical scoping:

```js
  if (match.status === 'FINISHED' && match.stage === 'FINAL' && match.winnerTeam) {
    const championships = await prisma.championship.findMany({
      where: { competitionCode: match.competitionCode },
      select: { id: true },
    })
    const championshipIds = championships.map(c => c.id)
    const winnerPreds = await prisma.tournamentWinnerPrediction.findMany({
      where: { championshipId: { in: championshipIds } },
    })
    for (const wp of winnerPreds) {
      ops.push(prisma.tournamentWinnerPrediction.update({
        where: { id: wp.id },
        data: { pointsAwarded: wp.predictedTeam === match.winnerTeam ? 50 : 0 },
      }))
    }
  }
```

Note: `sync-scores.mjs` has its own local `recalculateMatchPoints` that mirrors the one in `admin.ts`. The match object here comes from the DB (includes `competitionCode` field added in migration `47252eb`).

- [ ] **Step 2.3: Run tests**

```bash
npm test
```

Expected: all tests pass.

---

### Task 3: Compile prediction-reminders script — eliminate tsx at runtime

**Files:**
- Modify: `package.json` — add `esbuild` to devDependencies, move `tsx` to devDependencies
- Modify: `Dockerfile` — add compile step, update COPY list
- Modify: `entrypoint.sh` — use compiled `.mjs` instead of `.ts`

The `send-prediction-reminders.ts` script is invoked with `tsx` every 15 minutes in production. `tsx` transpiles TypeScript at runtime each invocation. Compiling once at build time is faster and removes a runtime dependency.

- [ ] **Step 3.1: Add esbuild to devDependencies and move tsx**

Edit `package.json`. Move `tsx` from `dependencies` to `devDependencies`. Add `esbuild`:

```json
  "dependencies": {
    "@base-ui/react": "^1.4.1",
    "@prisma/adapter-better-sqlite3": "^7.8.0",
    "@prisma/client": "^7.8.0",
    "@resvg/resvg-js": "^2.6.2",
    "bcryptjs": "^3.0.3",
    "better-sqlite3": "^12.9.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "iron-session": "^8.0.4",
    "lucide-react": "^1.14.0",
    "next": "^15.5.18",
    "nodemailer": "^8.0.7",
    "prisma": "^7.8.0",
    "react": "^19.2.6",
    "react-dom": "^19.2.6",
    "tailwind-merge": "^3.6.0",
    "tw-animate-css": "^1.4.0"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^20",
    "@types/nodemailer": "^8.0.0",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "@vitejs/plugin-react": "^6.0.1",
    "@vitest/coverage-v8": "^4.1.5",
    "esbuild": "^0.25.0",
    "eslint": "^8",
    "eslint-config-next": "15.5.18",
    "postcss": "8.5.14",
    "shadcn": "^4.7.0",
    "tailwindcss": "^3.4.1",
    "tsx": "^4.21.0",
    "typescript": "^5",
    "vite-tsconfig-paths": "^6.1.1",
    "vitest": "^4.1.5"
  },
```

- [ ] **Step 3.2: Install the new dependency**

```bash
npm install --legacy-peer-deps
```

Expected: `package-lock.json` updated, esbuild added to `node_modules`.

- [ ] **Step 3.3: Add compile step to Dockerfile builder stage**

In `Dockerfile`, after `RUN npm run build` in the `builder` stage, add:

```dockerfile
RUN npx esbuild scripts/send-prediction-reminders.ts \
  --bundle \
  --platform=node \
  --format=esm \
  --outfile=scripts/send-prediction-reminders.mjs \
  --external:@prisma/client \
  --external:@prisma/adapter-better-sqlite3 \
  --external:nodemailer \
  "--external:@resvg/resvg-js" \
  --external:better-sqlite3
```

- [ ] **Step 3.4: Update runner stage COPY list in Dockerfile**

In the `runner` stage, replace:

```dockerfile
COPY --from=builder /app/scripts/send-prediction-reminders.ts ./scripts/send-prediction-reminders.ts
COPY --from=builder /app/src/lib/email.ts ./src/lib/email.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
```

with:

```dockerfile
COPY --from=builder /app/scripts/send-prediction-reminders.mjs ./scripts/send-prediction-reminders.mjs
```

- [ ] **Step 3.5: Update entrypoint.sh**

Replace:

```sh
    node_modules/.bin/tsx scripts/send-prediction-reminders.ts || echo "[prediction-reminders] Reminder check skipped"
```

with:

```sh
    node scripts/send-prediction-reminders.mjs || echo "[prediction-reminders] Reminder check skipped"
```

- [ ] **Step 3.6: Run tests**

```bash
npm test
```

Expected: all tests pass (no test covers this script directly — verified via Docker build at deploy time).

---

### Task 4: Fix db.ts pragma setup — reuse Database instance

**Files:**
- Modify: `src/lib/db.ts`

The current code opens a throw-away `better-sqlite3` connection to set WAL/synchronous pragmas, then closes it and opens a second connection via the Prisma adapter. This means per-connection pragmas (e.g. `foreign_keys`) set on the throw-away connection do NOT apply to Prisma's connection. Reusing the same instance fixes this and removes the redundant open/close.

`PrismaBetterSqlite3` from `@prisma/adapter-better-sqlite3` accepts either `{ url: string }` or a `Database` instance directly.

- [ ] **Step 4.1: Rewrite `createPrismaClient` in `src/lib/db.ts`**

Replace the entire function:

```ts
import Database from 'better-sqlite3'
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

function createPrismaClient() {
  const url = (process.env.DATABASE_URL ?? 'file:./dev.db').replace(/^file:/, '')
  const db = new Database(url)
  // journal_mode and synchronous are file-level pragmas that persist across connections.
  // Setting them here also covers fresh DB files created by `prisma migrate deploy`.
  // foreign_keys is per-connection — setting it on the same instance Prisma uses ensures
  // it is active for all ORM operations.
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  const adapter = new PrismaBetterSqlite3(db)
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 4.2: Run tests**

```bash
npm test
```

Expected: all tests pass.

---

### Task 5: Commit Wave 1

- [ ] **Step 5.1: Stage and commit**

```bash
git add src/actions/predictions.ts src/actions/admin.ts scripts/sync-scores.mjs \
        package.json package-lock.json Dockerfile entrypoint.sh src/lib/db.ts
git commit -m "$(cat <<'EOF'
fix: scope tournament winner lock and recalculation by competitionCode

- saveTournamentWinnerPrediction/resetTournamentWinnerPrediction now filter
  the first-group-match lookup by championship.competitionCode instead of
  matching any competition's first match
- recalculateMatchPoints (admin.ts + sync-scores.mjs) now scopes
  TournamentWinnerPrediction updates to championships matching the match's
  competitionCode
- send-prediction-reminders compiled to MJS at Docker build time via
  esbuild — eliminates runtime tsx transpilation; tsx moved to devDeps
- db.ts reuses the same Database instance for pragmas and Prisma adapter
  so foreign_keys=ON applies to all ORM operations

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Wave 2 — Performance

### Task 6: Add missing database indexes

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration file (auto-generated)

`Match` queries almost always filter by `status` and/or `kickoff`. `Prediction` queries in the leaderboard path filter by `userId + championshipId`. None of these columns are indexed.

- [ ] **Step 6.1: Add indexes to schema.prisma**

In the `Match` model, add after the existing fields (before the closing `}`):

```prisma
  @@index([status])
  @@index([kickoff])
  @@index([status, kickoff])
```

In the `Prediction` model, add below the existing `@@index([matchId, championshipId])`:

```prisma
  @@index([userId, championshipId])
```

- [ ] **Step 6.2: Generate and apply migration**

```bash
DATABASE_URL="file:./dev.db" npx prisma migrate dev --name add-performance-indexes
```

Expected output: migration file created in `prisma/migrations/`, `dev.db` updated.

- [ ] **Step 6.3: Verify migration ran**

```bash
DATABASE_URL="file:./dev.db" npx prisma migrate status
```

Expected: `Database schema is up to date!`

- [ ] **Step 6.4: Run tests**

```bash
npm test
```

Expected: all tests pass.

---

### Task 7: Batch `recalculateAllPoints` — eliminate serial N+1

**Files:**
- Modify: `src/actions/admin.ts`

`recalculateAllPoints` iterates all finished matches and `await`s each `recalculateMatchPoints(match.id)` sequentially. Each call re-fetches the match. With 100 matches this means 100 sequential DB round-trips.

Fix: fetch all matches with their predictions+advances in one query, run recalculations concurrently (capped at 10 to avoid overwhelming SQLite's write serialization).

- [ ] **Step 7.1: Refactor `recalculateAllPoints` in `src/actions/admin.ts`**

Replace the current `recalculateAllPoints` implementation:

```ts
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function recalculateAllPoints(prevState: unknown) {
  const session = await requireAdmin()
  const matches = await prisma.match.findMany({
    where: { status: 'FINISHED' },
    include: { predictions: true, advances: true },
  })

  // Process in batches of 10 to avoid overwhelming SQLite concurrent writes
  const BATCH = 10
  for (let i = 0; i < matches.length; i += BATCH) {
    await Promise.all(matches.slice(i, i + BATCH).map((match) => recalculateMatchPoints(match.id)))
  }

  await logAdminAction({
    adminId: session.userId!,
    adminUsername: session.username ?? String(session.userId),
    action: 'RECALCULATE_POINTS',
    details: `Recalculated ${matches.length} finished matches`,
  })
  revalidatePath('/results')
  revalidatePath('/leaderboard')
  return { success: true, count: matches.length }
}
```

Note: `recalculateMatchPoints(matchId)` still does its own `findUnique` internally — that's fine, the DB is local SQLite and reads are cheap. The key win is removing sequential `await` serialization on the write transactions.

- [ ] **Step 7.2: Run tests**

```bash
npm test
```

Expected: all tests pass.

---

### Task 8: Single-pass leaderboard scoring

**Files:**
- Modify: `src/lib/leaderboard.ts`
- Test: `src/lib/__tests__/leaderboard.test.ts`

`getRankedUsers` currently makes 6 passes over each user's predictions array (3 filter passes for points, 3 filter passes for counts). Replace with a single-pass reduce.

- [ ] **Step 8.1: Write a new failing test for the single-pass behavior**

Add to `src/lib/__tests__/leaderboard.test.ts`:

```ts
  it('counts only positive-point predictions for each category', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      {
        id: 1,
        username: 'anna',
        predictions: [
          { type: 'EXACT_SCORE', pointsAwarded: 5 },
          { type: 'EXACT_SCORE', pointsAwarded: 0 },
          { type: 'SINGLE_OUTCOME', pointsAwarded: 3 },
          { type: 'SINGLE_OUTCOME', pointsAwarded: 0 },
          { type: 'DOUBLE_CHANCE', pointsAwarded: 1 },
          { type: 'DOUBLE_CHANCE', pointsAwarded: 0 },
        ],
        advances: [{ pointsAwarded: 1 }, { pointsAwarded: 0 }],
        winnerPredictions: [{ pointsAwarded: 50 }],
      },
    ] as never)

    const ranked = await getRankedUsers([1], champOn)
    expect(ranked[0].exact).toBe(1)
    expect(ranked[0].single).toBe(1)
    expect(ranked[0].double).toBe(1)
    expect(ranked[0].advance).toBe(1)
    expect(ranked[0].winner).toBe(1)
    expect(ranked[0].total).toBe(5 + 3 + 1 + 1 + 50)
  })
```

- [ ] **Step 8.2: Run the new test to verify it passes on current implementation**

```bash
npm test -- leaderboard
```

Expected: PASS (existing implementation handles this correctly — we're refactoring, not changing behavior).

- [ ] **Step 8.3: Refactor `getRankedUsers` to use a single-pass reduce**

Replace the user `.map()` callback in `src/lib/leaderboard.ts`:

```ts
  return users
    .map((u) => {
      const stats = u.predictions.reduce(
        (acc, p) => {
          const pts = p.pointsAwarded ?? 0
          if (p.type === 'EXACT_SCORE') {
            acc.exactPts += pts
            if (pts > 0) acc.exactCount++
          } else if (p.type === 'SINGLE_OUTCOME') {
            acc.singlePts += pts
            if (pts > 0) acc.singleCount++
          } else if (p.type === 'DOUBLE_CHANCE') {
            acc.doublePts += pts
            if (pts > 0) acc.doubleCount++
          }
          return acc
        },
        { exactPts: 0, singlePts: 0, doublePts: 0, exactCount: 0, singleCount: 0, doubleCount: 0 }
      )

      const advancePts = u.advances.reduce((sum, a) => sum + (a.pointsAwarded ?? 0), 0)
      const advanceCount = u.advances.filter((a) => (a.pointsAwarded ?? 0) > 0).length
      const winnerPts = u.winnerPredictions.reduce((sum, w) => sum + (w.pointsAwarded ?? 0), 0)
      const winnerCount = u.winnerPredictions.filter((w) => (w.pointsAwarded ?? 0) > 0).length

      const result: RankedUser = {
        id: u.id,
        username: u.username,
        total:
          stats.exactPts +
          stats.singlePts +
          (championship.doubleChanceEnabled ? stats.doublePts : 0) +
          advancePts +
          winnerPts,
        exact: stats.exactCount,
        single: stats.singleCount,
        advance: advanceCount,
        winner: winnerCount,
      }

      if (championship.doubleChanceEnabled) {
        result.double = stats.doubleCount
      }

      return result
    })
    .sort((a, b) => b.total - a.total || a.username.localeCompare(b.username))
```

- [ ] **Step 8.4: Run full test suite**

```bash
npm test
```

Expected: all tests pass including the new one.

---

### Task 9: Add lean `requireChampionshipAccess` variant

**Files:**
- Modify: `src/lib/championships.ts`
- Modify: `src/app/championships/[championshipId]/predictions/page.tsx`
- Modify: `src/app/championships/[championshipId]/leaderboard/page.tsx`

`requireChampionshipAccess` always includes `members: { include: { user: true } }` — full User objects. The predictions page and leaderboard page don't need User objects (only the results page does).

- [ ] **Step 9.1: Add lean variant to `src/lib/championships.ts`**

Add after the existing `requireChampionshipAccess` function:

```ts
export async function requireChampionshipAccessLean(championshipId: number) {
  const session = await requireAuth()
  if (!Number.isInteger(championshipId) || championshipId <= 0) redirect('/')
  const championship = await prisma.championship.findUnique({
    where: { id: championshipId },
    include: {
      members: { select: { userId: true } },
    },
  })

  if (!championship || !championship.isActive) redirect('/')
  const isMember = championship.members.some((m) => m.userId === session.userId)
  if (!isMember && !session.isAdmin) redirect('/')

  return { session, championship }
}
```

- [ ] **Step 9.2: Use lean variant in predictions page**

In `src/app/championships/[championshipId]/predictions/page.tsx`, update the import and call:

```ts
import { requireChampionshipAccessLean } from '@/lib/championships'
// ...
const { session, championship } = await requireChampionshipAccessLean(championshipId)
```

The predictions page uses `championship.id`, `championship.doubleChanceEnabled`, and `championship.members` (only to check membership via `session.userId` — which `requireChampionshipAccessLean` already handles). Verify `championship.members` is not directly iterated on this page (it is not — the page only uses `championship.id` and `championship.doubleChanceEnabled` after the access check).

- [ ] **Step 9.3: Use lean variant in leaderboard page**

In `src/app/championships/[championshipId]/leaderboard/page.tsx`, update import and call:

```ts
import { requireChampionshipAccessLean } from '@/lib/championships'
// ...
const [{ championship }, currentUser] = await Promise.all([
  requireChampionshipAccessLean(championshipId),
  getCurrentUser(),
])

const memberIds = championship.members.map((m) => m.userId)
```

- [ ] **Step 9.4: Run tests**

```bash
npm test
```

Expected: all tests pass.

---

### Task 10: Paginate results page

**Files:**
- Modify: `src/app/championships/[championshipId]/results/page.tsx`

The results page loads all FINISHED+LIVE matches unbounded. Default to 20 most-recent, with a "show older" link for page 2+.

- [ ] **Step 10.1: Add `searchParams` and pagination to results page**

Replace the entire page signature and match query:

```tsx
const PAGE_SIZE = 20

export default async function ChampionshipResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ championshipId: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const [{ championshipId: rawId }, sp] = await Promise.all([params, searchParams])
  const championshipId = parseInt(rawId, 10)
  const page = Math.max(1, parseInt(sp?.page ?? '1', 10))

  const { session, championship } = await requireChampionshipAccess(championshipId)
  const timezone = session.timezone ?? 'Europe/Bucharest'
  const memberIds = championship.members.map((member) => member.userId)
  const members = championship.members.map((member) => member.user)

  const [matches, totalFinished] = await Promise.all([
    prisma.match.findMany({
      where: { status: { in: ['FINISHED', 'LIVE'] } },
      orderBy: { kickoff: 'desc' },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        predictions: { where: { userId: { in: memberIds } }, include: { user: true } },
        advances: { where: { userId: { in: memberIds } }, include: { user: true } },
      },
    }),
    prisma.match.count({ where: { status: { in: ['FINISHED', 'LIVE'] } } }),
  ])

  const hasMore = page * PAGE_SIZE < totalFinished
  const hasPrev = page > 1
```

- [ ] **Step 10.2: Add pagination controls to the JSX**

At the bottom of the returned JSX, after the matches map, add:

```tsx
      {(hasMore || hasPrev) && (
        <div className="flex items-center justify-between pt-2">
          {hasPrev ? (
            <a
              href={`?page=${page - 1}`}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10"
            >
              ← Newer
            </a>
          ) : <span />}
          <span className="text-xs text-white/30">Page {page}</span>
          {hasMore ? (
            <a
              href={`?page=${page + 1}`}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10"
            >
              Older →
            </a>
          ) : <span />}
        </div>
      )}
```

- [ ] **Step 10.3: Run tests**

```bash
npm test
```

Expected: all tests pass.

---

### Task 11: Commit Wave 2

- [ ] **Step 11.1: Stage and commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/actions/admin.ts \
        src/lib/leaderboard.ts src/lib/__tests__/leaderboard.test.ts \
        src/lib/championships.ts \
        "src/app/championships/[championshipId]/predictions/page.tsx" \
        "src/app/championships/[championshipId]/leaderboard/page.tsx" \
        "src/app/championships/[championshipId]/results/page.tsx"
git commit -m "$(cat <<'EOF'
perf: add DB indexes, batch recalculate, single-pass leaderboard, paginate results

- Add @@index([status]), @@index([kickoff]), @@index([status,kickoff]) to Match
- Add @@index([userId, championshipId]) to Prediction
- recalculateAllPoints batches in groups of 10 concurrently instead of serial await
- getRankedUsers uses single-pass reduce (6 array passes → 1)
- requireChampionshipAccessLean skips loading full User objects for
  predictions and leaderboard pages
- Results page defaults to 20 most-recent matches with page navigation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Wave 3 — Code Quality

### Task 12: Extract shared scoring constants for sync-scores.mjs

**Files:**
- Create: `scripts/scoring-constants.mjs`
- Modify: `scripts/sync-scores.mjs`

`sync-scores.mjs` hardcodes scoring points (3, 5, 1, 50) inline. `src/lib/scoring.ts` has the same values as named constants. Scripts can't import TypeScript at runtime, so a shared `.mjs` constants file bridges the gap.

- [ ] **Step 12.1: Create `scripts/scoring-constants.mjs`**

```js
// Single source of truth for scoring point values used by both
// src/lib/scoring.ts (TypeScript) and scripts/*.mjs (plain JS).
// If you change values here, update SCORING in src/lib/scoring.ts to match.
export const SCORING = {
  EXACT_SCORE: 5,
  SINGLE_OUTCOME: 3,
  DOUBLE_CHANCE: 1,
  ADVANCE: 1,
  TOURNAMENT_WINNER: 50,
}
```

- [ ] **Step 12.2: Import constants in sync-scores.mjs**

At the top of `scripts/sync-scores.mjs`, add:

```js
import { SCORING } from './scoring-constants.mjs'
```

Then replace all hardcoded magic numbers in `calcPredictionPoints`:

```js
function calcPredictionPoints(type, value, homeScore, awayScore) {
  const outcome = homeScore > awayScore ? '1' : homeScore === awayScore ? 'X' : '2'
  if (type === 'SINGLE_OUTCOME') return value === outcome ? SCORING.SINGLE_OUTCOME : 0
  if (type === 'DOUBLE_CHANCE') {
    const map = { '1X': ['1', 'X'], 'X2': ['X', '2'], '12': ['1', '2'] }
    return (map[value] ?? []).includes(outcome) ? SCORING.DOUBLE_CHANCE : 0
  }
  if (type === 'EXACT_SCORE') {
    const [h, a] = value.split('-').map(Number)
    return h === homeScore && a === awayScore ? SCORING.EXACT_SCORE : 0
  }
  return 0
}
```

And in `recalculateMatchPoints` in the same file, replace the winner prediction points literal:

```js
        data: { pointsAwarded: wp.predictedTeam === match.winnerTeam ? SCORING.TOURNAMENT_WINNER : 0 },
```

- [ ] **Step 12.3: Update Dockerfile to copy the new file**

In the `runner` stage `COPY` section, add:

```dockerfile
COPY --from=builder /app/scripts/scoring-constants.mjs ./scripts/scoring-constants.mjs
```

- [ ] **Step 12.4: Run tests**

```bash
npm test
```

Expected: all tests pass.

---

### Task 13: Split `app/live/page.tsx` into focused components

**Files:**
- Create: `src/components/team-block.tsx`
- Create: `src/components/card-badge.tsx`
- Create: `src/components/match-stats-row.tsx`
- Create: `src/components/pre-match-panel.tsx`
- Create: `src/components/live-match-panel.tsx`
- Modify: `src/app/live/page.tsx`

The live page is 280+ lines mixing data fetching and 5 UI sub-components. Split each component into its own file. No behavioral changes.

- [ ] **Step 13.1: Create `src/components/team-block.tsx`**

```tsx
import Image from 'next/image'

export function TeamBlock({ name, crest }: { name: string; crest: string }) {
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

- [ ] **Step 13.2: Create `src/components/card-badge.tsx`**

```tsx
export function CardBadge({ card }: { card: string }) {
  const isRed = card === 'RED_CARD' || card === 'YELLOW_RED_CARD'
  return (
    <span
      style={{
        display: 'inline-block',
        width: 10,
        height: 14,
        background: isRed ? '#EF4444' : '#FACC15',
        borderRadius: 2,
        flexShrink: 0,
        boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
      }}
    />
  )
}
```

- [ ] **Step 13.3: Create `src/components/match-stats-row.tsx`**

```tsx
import { Fragment } from 'react'

type TeamStat = {
  teamId: string
  teamName: string
  type: 'FOULS' | 'CORNERS' | 'OFFSIDES' | 'FREE_KICKS' | 'GOAL_KICKS' | 'SAVES' | 'THROW_INS' | 'SHOTS_ON_GOAL' | 'SHOTS_OFF_GOAL' | 'YELLOW_CARDS' | 'RED_CARDS'
  value: number
}

const STAT_ROWS: { label: string; type: string }[] = [
  { label: 'Corners', type: 'CORNERS' },
  { label: 'Free Kicks', type: 'FREE_KICKS' },
  { label: 'Goal Kicks', type: 'GOAL_KICKS' },
  { label: 'Offsides', type: 'OFFSIDES' },
  { label: 'Fouls', type: 'FOULS' },
  { label: 'Saves', type: 'SAVES' },
  { label: 'Throw-Ins', type: 'THROW_INS' },
  { label: 'Shots On Goal', type: 'SHOTS_ON_GOAL' },
  { label: 'Shots Off Goal', type: 'SHOTS_OFF_GOAL' },
  { label: 'Yellow Cards', type: 'YELLOW_CARDS' },
  { label: 'Red Cards', type: 'RED_CARDS' },
]

export function MatchStatsRow({
  homeId,
  awayId,
  teamStats,
}: {
  homeId: string
  awayId: string
  teamStats: TeamStat[]
}) {
  const get = (id: string, type: string) =>
    teamStats.find((s) => s.teamId === id && s.type === type)?.value ?? 0

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0a1628]">
      <div className="border-b border-white/5 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white/40">
        Match Stats
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-6 p-3 text-sm">
        {STAT_ROWS.map(({ label, type }) => {
          const h = get(homeId, type)
          const a = get(awayId, type)
          return (
            <Fragment key={type}>
              <span className="py-1 text-right font-bold text-white">{h}</span>
              <span className="py-1 text-center text-xs text-white/50">{label}</span>
              <span className="py-1 text-left font-bold text-white">{a}</span>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 13.4: Create `src/components/pre-match-panel.tsx`**

```tsx
import { TeamBlock } from '@/components/team-block'

interface PreMatchProps {
  match: {
    id: number
    homeTeam: string
    awayTeam: string
    homeTeamCrest: string
    awayTeamCrest: string
    kickoff: Date
  }
  now: Date
}

export function PreMatchPanel({ match, now }: PreMatchProps) {
  const msUntil = match.kickoff.getTime() - now.getTime()
  const minsUntil = Math.max(0, Math.floor(msUntil / 60000))

  return (
    <div className="space-y-4">
      <div className="flex items-center rounded-xl border border-white/10 bg-[#0a1628] px-8 py-5">
        <div className="flex flex-1 justify-center">
          <TeamBlock name={match.homeTeam} crest={match.homeTeamCrest} />
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <div className="flex items-center gap-2 rounded-full bg-amber-950 px-3 py-0.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            <span className="text-xs font-bold uppercase tracking-widest text-amber-300">Starting soon</span>
          </div>
          <div className="text-5xl font-black tabular-nums text-white/20">
            - <span className="text-white/15">:</span> -
          </div>
          <div className="text-sm text-white/50">
            {minsUntil === 0 ? 'Kick-off now' : `in ${minsUntil} min`}
          </div>
        </div>
        <div className="flex flex-1 justify-center">
          <TeamBlock name={match.awayTeam} crest={match.awayTeamCrest} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 13.5: Create `src/components/live-match-panel.tsx`**

Extract `LiveMatchPanel` from `app/live/page.tsx` into this new file. Also move `mergeBookings` to module scope here:

```tsx
import Image from 'next/image'
import { fetchLiveMatchDetails } from '@/lib/football-api'
import { PitchFormation } from '@/components/pitch-formation'
import { TeamBlock } from '@/components/team-block'
import { CardBadge } from '@/components/card-badge'
import { MatchStatsRow } from '@/components/match-stats-row'
import type { NormalizedMatch } from '@/lib/football-api'

type Booking = Awaited<ReturnType<typeof fetchLiveMatchDetails>>['bookings'][number]

function mergeBookings(bookings: Booking[]): Booking[] {
  const yellows: Record<string, number> = {}
  return bookings.map((b) => {
    if (b.card === 'YELLOW_CARD') {
      yellows[b.playerName] = (yellows[b.playerName] ?? 0) + 1
      if (yellows[b.playerName] >= 2) return { ...b, card: 'YELLOW_RED_CARD' as const }
    }
    return b
  })
}

export async function LiveMatchPanel({ liveMatch }: { liveMatch: NormalizedMatch }) {
  let details: Awaited<ReturnType<typeof fetchLiveMatchDetails>>
  try {
    details = await fetchLiveMatchDetails(liveMatch.externalId)
  } catch {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="text-5xl">⚽</div>
        <h2 className="text-2xl font-bold text-white">{liveMatch.homeTeam} vs {liveMatch.awayTeam}</h2>
        <p className="text-white/50">Live match data is unavailable. Please try again shortly.</p>
      </div>
    )
  }

  const homeId = details.homeTeam.id
  const awayId = details.awayTeam.id
  const homeScore = details.homeScore ?? 0
  const awayScore = details.awayScore ?? 0

  const homeGoals = details.goals.filter((g) => g.teamId === homeId)
  const awayGoals = details.goals.filter((g) => g.teamId === awayId)
  const homeBookings = mergeBookings(details.bookings.filter((b) => b.teamId === homeId))
  const awayBookings = mergeBookings(details.bookings.filter((b) => b.teamId === awayId))
  const homeSubs = details.substitutions.filter((s) => s.teamId === homeId)
  const awaySubs = details.substitutions.filter((s) => s.teamId === awayId)

  return (
    <div className="space-y-4">
      {/* Score header */}
      <div className="flex items-center rounded-xl border border-white/10 bg-[#0a1628] px-8 py-5">
        <div className="flex flex-1 justify-center">
          <TeamBlock name={details.homeTeam.name} crest={details.homeTeam.crest} />
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          {details.halftime ? (
            <div className="flex items-center gap-2 rounded-full bg-blue-950 px-3 py-0.5">
              <span className="text-xs font-bold uppercase tracking-widest text-blue-300">Half Time</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-full bg-red-950 px-3 py-0.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              <span className="text-xs font-bold uppercase tracking-widest text-red-300">Live</span>
            </div>
          )}
          <div className="text-5xl font-black tabular-nums text-[#C9A84C]">
            {homeScore} <span className="text-white/30">:</span> {awayScore}
          </div>
          {details.halftime ? (
            <div className="text-sm font-bold text-white/50">HT</div>
          ) : details.minute !== null && (
            <div className="text-sm text-white/50">{details.minute}&apos;</div>
          )}
          {details.venue && (
            <div className="text-xs text-white/30">{details.venue}</div>
          )}
        </div>
        <div className="flex flex-1 justify-center">
          <TeamBlock name={details.awayTeam.name} crest={details.awayTeam.crest} />
        </div>
      </div>

      {/* 3D Pitch — hidden on mobile */}
      <div className="hidden md:block">
        <PitchFormation
          homeTeam={details.homeTeam}
          awayTeam={details.awayTeam}
          goals={details.goals}
          bookings={details.bookings}
          substitutions={details.substitutions}
          referee={details.referee}
          homePossession={details.homePossession}
        />
      </div>

      {/* Match Stats */}
      {details.teamStats.length > 0 && (
        <MatchStatsRow
          homeId={String(details.homeTeam.id)}
          awayId={String(details.awayTeam.id)}
          teamStats={details.teamStats}
        />
      )}

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
                  {g.type === 'OWN_GOAL' && <span className="text-xs font-bold text-orange-400">OG</span>}
                  <span className="text-xs font-bold text-white/40">{g.minute}&apos;</span>
                </div>
              ))}
            </div>
            <div className="bg-white/5" />
            <div className="flex flex-col items-end gap-2 p-3">
              {awayGoals.map((g, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-xs font-bold text-white/40">{g.minute}&apos;</span>
                  {g.type === 'OWN_GOAL' && <span className="text-xs font-bold text-orange-400">OG</span>}
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
            Cards
          </div>
          <div className="grid grid-cols-[1fr_1px_1fr]">
            <div className="flex flex-col gap-2 p-3">
              {homeBookings.map((b, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <CardBadge card={b.card} />
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
                  <CardBadge card={b.card} />
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
```

- [ ] **Step 13.6: Rewrite `src/app/live/page.tsx` as a thin shell**

Replace the entire file with the slimmed-down version that only handles data fetching:

```tsx
import { fetchLiveMatches, type NormalizedMatch } from '@/lib/football-api'
import { LivePageRefresh } from '@/components/live-page-refresh'
import { LiveMatchPanel } from '@/components/live-match-panel'
import { PreMatchPanel } from '@/components/pre-match-panel'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const revalidate = 5

export default async function LivePage() {
  await requireAuth()

  const now = new Date()
  const soonCutoff = new Date(now.getTime() + 15 * 60 * 1000)

  let liveMatches: NormalizedMatch[]
  try {
    liveMatches = await fetchLiveMatches()
  } catch {
    liveMatches = []
  }

  const upcomingMatches = await prisma.match.findMany({
    where: { status: 'SCHEDULED', kickoff: { gte: now, lte: soonCutoff } },
    orderBy: { kickoff: 'asc' },
  })

  const hasActivity = liveMatches.length > 0 || upcomingMatches.length > 0

  if (!hasActivity) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="text-5xl">⚽</div>
        <h1 className="text-2xl font-bold text-white">No live match right now</h1>
        <p className="text-white/50">Check back when a match is in play.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <LivePageRefresh isLive={hasActivity} />
      {upcomingMatches.map((match) => (
        <PreMatchPanel key={match.id} match={match} now={now} />
      ))}
      {liveMatches.map((liveMatch) => (
        <LiveMatchPanel key={liveMatch.externalId} liveMatch={liveMatch} />
      ))}
    </div>
  )
}
```

- [ ] **Step 13.7: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 13.8: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors. If there are import errors, check that `NormalizedMatch` and `fetchLiveMatchDetails` return types are correctly imported in `live-match-panel.tsx`.

---

### Task 14: Commit Wave 3

- [ ] **Step 14.1: Stage and commit**

```bash
git add scripts/scoring-constants.mjs scripts/sync-scores.mjs Dockerfile \
        src/components/team-block.tsx src/components/card-badge.tsx \
        src/components/match-stats-row.tsx src/components/pre-match-panel.tsx \
        src/components/live-match-panel.tsx src/app/live/page.tsx
git commit -m "$(cat <<'EOF'
refactor: extract scoring constants, split live page into components

- scripts/scoring-constants.mjs is the single source of truth for point
  values; sync-scores.mjs imports from it instead of hardcoding
- app/live/page.tsx reduced from 280+ lines to ~40 by extracting
  LiveMatchPanel, PreMatchPanel, MatchStatsRow, CardBadge, TeamBlock
  into src/components/
- mergeBookings moved to module scope in live-match-panel.tsx
- Inline <style> hack replaced with hidden md:block Tailwind classes

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Post-implementation

- [ ] Push all three commits to GitHub:
  ```bash
  git push origin main
  ```
- [ ] CI/CD will build a new Docker image and deploy via Dockhand.
- [ ] Verify the running container: `docker logs ScoreProphet --tail 50` — confirm no startup errors.
- [ ] Check leaderboard, results (paginated), and live page render correctly.
