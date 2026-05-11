import { prisma } from '@/lib/db'

export interface RankedUser {
  id: number
  username: string
  total: number
  exact: number
  single: number
  double: number
  advance: number
}

export async function getRankedUsers(userIds?: number[]): Promise<RankedUser[]> {
  if (userIds && userIds.length === 0) return []

  const users = await prisma.user.findMany({
    where: userIds ? { id: { in: userIds } } : undefined,
    include: {
      predictions: { where: { pointsAwarded: { not: null } } },
      advances: { where: { pointsAwarded: { not: null } } },
    },
  })

  return users
    .map((u) => ({
      id: u.id,
      username: u.username,
      total:
        u.predictions.reduce((sum, prediction) => sum + (prediction.pointsAwarded ?? 0), 0) +
        u.advances.reduce((sum, advance) => sum + (advance.pointsAwarded ?? 0), 0),
      exact: u.predictions.filter((p) => p.type === 'EXACT_SCORE' && (p.pointsAwarded ?? 0) > 0).length,
      single: u.predictions.filter((p) => p.type === 'SINGLE_OUTCOME' && (p.pointsAwarded ?? 0) > 0).length,
      double: u.predictions.filter((p) => p.type === 'DOUBLE_CHANCE' && (p.pointsAwarded ?? 0) > 0).length,
      advance: u.advances.filter((a) => (a.pointsAwarded ?? 0) > 0).length,
    }))
    .sort((a, b) => b.total - a.total || a.username.localeCompare(b.username))
}
