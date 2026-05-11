import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/db'
import { getRankedUsers } from '@/lib/leaderboard'

describe('getRankedUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('filters by championship member user IDs and ranks by total points', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      {
        id: 2,
        username: 'bob',
        predictions: [{ type: 'EXACT_SCORE', pointsAwarded: 5 }],
        advances: [],
      },
      {
        id: 1,
        username: 'anna',
        predictions: [{ type: 'SINGLE_OUTCOME', pointsAwarded: 3 }],
        advances: [{ pointsAwarded: 1 }],
      },
    ] as never)

    const ranked = await getRankedUsers([1, 2])

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [1, 2] } } }))
    expect(ranked.map((user) => user.username)).toEqual(['bob', 'anna'])
    expect(ranked.map((user) => user.total)).toEqual([5, 4])
  })

  it('does not query when the membership list is empty', async () => {
    expect(await getRankedUsers([])).toEqual([])
    expect(prisma.user.findMany).not.toHaveBeenCalled()
  })
})
