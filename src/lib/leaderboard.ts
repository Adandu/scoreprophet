import { prisma } from '@/lib/db'

export interface RankedUser {
  id: number
  username: string
  total: number
  exact: number
  single: number
  double?: number
  advance: number
  winner: number
}

export async function getRankedUsers(
  userIds: number[],
  championship: { id: number; doubleChanceEnabled: boolean }
): Promise<RankedUser[]> {
  if (userIds.length === 0) return []

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    include: {
      predictions: { where: { pointsAwarded: { not: null }, championshipId: championship.id } },
      advances: { where: { pointsAwarded: { not: null }, championshipId: championship.id } },
      winnerPredictions: { where: { pointsAwarded: { not: null }, championshipId: championship.id } },
    },
  })

  return users
    .map((u) => {
      const pred = u.predictions.reduce(
        (acc, p) => {
          const pts = p.pointsAwarded ?? 0
          if (p.type === 'EXACT_SCORE') { acc.exactPts += pts; if (pts > 0) acc.exact++ }
          else if (p.type === 'SINGLE_OUTCOME') { acc.singlePts += pts; if (pts > 0) acc.single++ }
          else if (p.type === 'DOUBLE_CHANCE') { acc.doublePts += pts; if (pts > 0) acc.double++ }
          return acc
        },
        { exactPts: 0, singlePts: 0, doublePts: 0, exact: 0, single: 0, double: 0 }
      )
      const advancePts = u.advances.reduce((sum, a) => sum + (a.pointsAwarded ?? 0), 0)
      const advance = u.advances.filter((a) => (a.pointsAwarded ?? 0) > 0).length
      const winnerPts = u.winnerPredictions.reduce((sum, w) => sum + (w.pointsAwarded ?? 0), 0)
      const winner = u.winnerPredictions.filter((w) => (w.pointsAwarded ?? 0) > 0).length

      const result: RankedUser = {
        id: u.id,
        username: u.username,
        total: pred.exactPts + pred.singlePts + (championship.doubleChanceEnabled ? pred.doublePts : 0) + advancePts + winnerPts,
        exact: pred.exact,
        single: pred.single,
        advance,
        winner,
      }

      if (championship.doubleChanceEnabled) result.double = pred.double

      return result
    })
    .sort((a, b) => b.total - a.total || a.username.localeCompare(b.username))
}
