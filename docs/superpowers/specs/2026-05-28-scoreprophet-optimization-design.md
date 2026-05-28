# ScoreProphet Optimization Design

**Date:** 2026-05-28
**Scope:** Full sweep — correctness bugs, performance, code quality
**Approach:** Three sequential waves, each independently testable

---

## Context

ScoreProphet is a Next.js 15 / SQLite (Prisma + better-sqlite3) football prediction app. It runs in a single Docker container on MasterChief with four background loops (score sync, H2H sync, stats sync, prediction reminders). A deep dive identified 14 issues across correctness, performance, and code quality.

---

## Wave 1 — Correctness (no migration required)

### 1.1 Tournament winner lock ignores competition code

**File:** `src/actions/predictions.ts` — `saveTournamentWinnerPrediction` and `resetTournamentWinnerPrediction`

**Problem:** Both functions query `prisma.match.findFirst({ where: { stage: 'GROUP' } })` with no `competitionCode` filter. For a multi-competition championship this picks the first group match of *any* competition, not the championship's own, locking the prediction at the wrong time.

**Fix:** Look up the championship's `competitionCode` first, then scope the `findFirst` to `{ stage: 'GROUP', competitionCode }`.

```ts
// Before
const firstGroupMatch = await prisma.match.findFirst({
  where: { stage: 'GROUP' },
  ...
})

// After
const [championship, firstGroupMatch] = await Promise.all([
  prisma.championship.findUnique({ where: { id: championshipId }, select: { competitionCode: true } }),
  // Use the code in the second query after fetching it — do sequentially
])
// Actually: fetch championship first (already done in the parallel block above for membership),
// then use its competitionCode in the match query.
```

Concretely: in both `saveTournamentWinnerPrediction` and `resetTournamentWinnerPrediction`, the existing `prisma.championshipMember.findFirst` already returns the membership. Add `championship: { select: { competitionCode: true } }` to that include, then pass `competitionCode` to the `match.findFirst` filter.

### 1.2 Winner prediction recalculation not scoped by championship

**File:** `scripts/sync-scores.mjs` — `recalculateMatchPoints` function (~line 52)

**Problem:** When the FINAL is played, `prisma.tournamentWinnerPrediction.findMany()` fetches winner predictions across **all** championships, not just the one tied to the match's competition. If two championships exist for different competitions, all winner predictions are recalculated regardless of relevance.

**Fix:** Look up the championship(ies) whose `competitionCode` matches the match's `competitionCode`, then scope the `findMany` to `{ championshipId: { in: matchingChampionshipIds } }`.

```js
// After updating a FINAL match:
const championships = await prisma.championship.findMany({
  where: { competitionCode: match.competitionCode },
  select: { id: true },
})
const championshipIds = championships.map(c => c.id)
const winnerPreds = await prisma.tournamentWinnerPrediction.findMany({
  where: { championshipId: { in: championshipIds } },
})
```

Apply the same fix to `src/actions/admin.ts` `recalculateMatchPoints` (same logical issue, different file).

### 1.3 Prediction reminders use `tsx` in production

**File:** `entrypoint.sh`, `Dockerfile`, `scripts/send-prediction-reminders.ts`

**Problem:** The reminder loop runs `node_modules/.bin/tsx scripts/send-prediction-reminders.ts` in production. `tsx` is a dev-only TypeScript transpiler — it's slow, adds overhead to every loop iteration, and should not be used in production containers.

**Fix:** Convert `send-prediction-reminders.ts` to `send-prediction-reminders.mjs` (ESM), import from compiled JS paths or inline the logic. Add it to the Dockerfile `COPY` list. Update `entrypoint.sh` to call `node scripts/send-prediction-reminders.mjs`.

Alternatively: add a build step in Dockerfile that compiles the script with `tsc` or `esbuild` to `scripts/send-prediction-reminders.mjs` and copy the output. This is simpler than rewriting the script manually.

### 1.4 DB pragma setup uses a throw-away connection

**File:** `src/lib/db.ts`

**Problem:** `createPrismaClient` opens a `better-sqlite3` connection, sets WAL and synchronous pragmas, then immediately closes it. These are file-level pragmas that persist — but only if the file already exists. If Prisma creates the DB file for the first time (e.g., fresh container), these pragmas won't be applied on that startup.

**Fix:** Set the pragmas via the Prisma driver after client creation using `prisma.$executeRawUnsafe`. Since these are connection-level for `synchronous` but file-level for `journal_mode`, use `$connect()` then `$executeRaw`:

```ts
const adapter = new PrismaBetterSqlite3({ url })
const client = new PrismaClient({ adapter, ... })
// WAL and synchronous pragmas via the same connection Prisma uses
await client.$executeRawUnsafe(`PRAGMA journal_mode = WAL`)
await client.$executeRawUnsafe(`PRAGMA synchronous = NORMAL`)
```

This ensures pragmas are applied on every connection regardless of whether the file is new or pre-existing.

---

## Wave 2 — Performance (one DB migration)

### 2.1 Missing indexes on Match and Prediction

**File:** `prisma/schema.prisma`

**Problem:** `Match` has no index on `status` or `kickoff`. Nearly every query filters on one or both. `Prediction` has `@@index([matchId, championshipId])` but no `@@index([userId, championshipId])`, which the leaderboard query uses.

**Fix:** Add to schema:
```prisma
model Match {
  // existing fields...
  @@index([status])
  @@index([kickoff])
  @@index([status, kickoff])  // composite for SCHEDULED + kickoff range queries
}

model Prediction {
  // existing indexes...
  @@index([userId, championshipId])
}
```

Generate and apply migration: `prisma migrate dev --name add-performance-indexes`.

### 2.2 `recalculateAllPoints` is serial N+1

**File:** `src/actions/admin.ts` — `recalculateAllPoints`

**Problem:** Iterates finished matches and `await`s each `recalculateMatchPoints(match.id)` serially. Each call does a redundant `findUnique` when the match data is already available.

**Fix:** Refactor `recalculateMatchPoints` to accept the full match object (with predictions/advances included), and in `recalculateAllPoints`, fetch all matches with their predictions in one query, then run recalculations concurrently with `Promise.all`.

```ts
async function recalculateAllPoints() {
  const matches = await prisma.match.findMany({
    where: { status: 'FINISHED' },
    include: { predictions: true, advances: true },
  })
  await Promise.all(matches.map(match => recalculateMatchPoints(match)))
}
```

Cap concurrency at ~10 if there are many matches to avoid overwhelming SQLite.

### 2.3 Leaderboard makes 6 array passes per user

**File:** `src/lib/leaderboard.ts` — `getRankedUsers`

**Problem:** For each user, the code filters `u.predictions` by type (3 filters), then filters again for `pointsAwarded > 0` (3 more filters) = 6 passes over the same array.

**Fix:** Single-pass reduce:

```ts
const stats = u.predictions.reduce(
  (acc, p) => {
    if (p.type === 'EXACT_SCORE') {
      acc.exactPts += p.pointsAwarded ?? 0
      if ((p.pointsAwarded ?? 0) > 0) acc.exactCount++
    } else if (p.type === 'SINGLE_OUTCOME') {
      acc.singlePts += p.pointsAwarded ?? 0
      if ((p.pointsAwarded ?? 0) > 0) acc.singleCount++
    } else if (p.type === 'DOUBLE_CHANCE') {
      acc.doublePts += p.pointsAwarded ?? 0
      if ((p.pointsAwarded ?? 0) > 0) acc.doubleCount++
    }
    return acc
  },
  { exactPts: 0, singlePts: 0, doublePts: 0, exactCount: 0, singleCount: 0, doubleCount: 0 }
)
```

### 2.4 `requireChampionshipAccess` always loads full User objects

**File:** `src/lib/championships.ts` — `requireChampionshipAccess`

**Problem:** Every predictions/leaderboard/manage page calls `requireChampionshipAccess` which includes `members: { include: { user: true } }`. Most callers only need member IDs (to check membership) or the championship metadata. Only the results page needs full user objects.

**Fix:** Add a lean variant:

```ts
export async function requireChampionshipAccessLean(championshipId: number) {
  // Returns { session, championship } where championship.members is [{ userId }] only
  // include: { members: { select: { userId: true } } }
}
```

Use the lean variant in predictions, leaderboard, manage pages. Keep the full variant for results page only.

### 2.5 Results page loads all matches unbounded

**File:** `src/app/championships/[championshipId]/results/page.tsx`

**Problem:** Loads all FINISHED+LIVE matches with all predictions/advances for all members. No limit. With 100+ matches this is a large query.

**Fix:** Default to most recent 20 matches. Add a `?page=N` search param for load-more (or "show all" link). No infinite scroll needed — a simple page offset is sufficient.

```ts
const page = parseInt(searchParams?.page ?? '1', 10)
const pageSize = 20
const matches = await prisma.match.findMany({
  where: { status: { in: ['FINISHED', 'LIVE'] } },
  orderBy: { kickoff: 'desc' },
  take: pageSize,
  skip: (page - 1) * pageSize,
  include: { ... },
})
```

---

## Wave 3 — Code Quality (no behavioral changes)

### 3.1 Scoring logic duplicated in sync-scores.mjs

**File:** `scripts/sync-scores.mjs`

**Problem:** `calcPredictionPoints` and hardcoded constants (3, 5, 1, 50) duplicate `src/lib/scoring.ts`. A rule change requires editing two files.

**Fix:** Scripts cannot import TypeScript at runtime in production. Solution: extract scoring constants to `scripts/scoring-constants.json` and import in both the `.ts` lib and the `.mjs` script. Or inline a comment in sync-scores pointing to scoring.ts as the source of truth and keep the values in sync via a lint rule.

The cleanest approach: create `scripts/scoring.mjs` with the plain-JS constants and logic, have both `sync-scores.mjs` and the build process reference it. The `.ts` lib re-exports from its own constants (keeping TypeScript types) but the values live in one place.

### 3.2 Split `app/live/page.tsx` (280+ lines)

**File:** `src/app/live/page.tsx`

**Problem:** A single file contains the page, data fetching, and 5 UI components. Hard to maintain.

**Fix:** Extract to separate component files:
- `src/components/live-match-panel.tsx` — `LiveMatchPanel` + `mergeBookings`
- `src/components/pre-match-panel.tsx` — `PreMatchPanel`
- `src/components/match-stats-row.tsx` — `MatchStatsRow`
- `src/components/card-badge.tsx` — `CardBadge`
- `src/components/team-block.tsx` — `TeamBlock`

Keep `app/live/page.tsx` as the data-fetching shell only (~40 lines).

### 3.3 `mergeBookings` at module scope

**File:** `src/app/live/page.tsx` → moved to `src/components/live-match-panel.tsx`

**Fix:** Define as a named function at module scope, not inside the component function body.

### 3.4 Replace inline `<style>` tag for pitch visibility

**File:** `src/app/live/page.tsx`

**Problem:** `<style>{\`#sp-pitch{display:none}@media(min-width:768px){#sp-pitch{display:block}}\`}</style>` is an anti-pattern.

**Fix:** Replace the `id="sp-pitch"` div with `className="hidden md:block"` — standard Tailwind responsive utility. Remove the inline `<style>` and `id` attribute entirely.

---

## Out of Scope

- Rate-limit in-memory store (fine for single-instance homelab deployment)
- `WC_TEAM_COLORS` hardcoded map (not a problem, just data)
- Dual-polling on `/live` (ISR + client refresh) — the ISR layer serves cached responses; client refresh triggers delivery, not re-fetch from external API on every call. Not a real issue.

---

## Testing Plan

- Wave 1: Manual — create a multi-competition scenario in dev DB, verify tournament winner lock triggers on the correct competition's first match. Verify sync-scores winner recalc scopes correctly.
- Wave 2: Run existing vitest suite (all unit tests pass). Verify leaderboard renders correctly with known test data. Check query performance with `EXPLAIN QUERY PLAN` on Match queries after migration.
- Wave 3: Visual regression — load `/live` page and confirm pitch is still hidden on mobile and visible on desktop. Confirm no console errors.
