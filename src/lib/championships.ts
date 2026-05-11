import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { requireAuth } from '@/lib/auth'

export interface ChampionshipSummary {
  id: number
  name: string
  description: string
  isActive: boolean
}

export async function getUserChampionships(userId: number): Promise<ChampionshipSummary[]> {
  const memberships = await prisma.championshipMember.findMany({
    where: {
      userId,
      championship: { isActive: true },
    },
    include: { championship: true },
    orderBy: { championship: { name: 'asc' } },
  })

  return memberships.map(({ championship }) => ({
    id: championship.id,
    name: championship.name,
    description: championship.description,
    isActive: championship.isActive,
  }))
}

export async function getSelectedChampionship(userId: number): Promise<ChampionshipSummary | null> {
  const session = await getSession()
  const championships = await getUserChampionships(userId)
  if (championships.length === 0) return null

  const selected = championships.find((championship) => championship.id === session.selectedChampionshipId)
  return selected ?? championships[0]
}

export async function requireChampionshipAccess(championshipId: number) {
  const session = await requireAuth()
  if (!Number.isInteger(championshipId) || championshipId <= 0) redirect('/')
  const championship = await prisma.championship.findUnique({
    where: { id: championshipId },
    include: { members: { include: { user: true }, orderBy: { user: { username: 'asc' } } } },
  })

  if (!championship || !championship.isActive) redirect('/')
  const isMember = championship.members.some((member) => member.userId === session.userId)
  if (!isMember) redirect('/')

  return { session, championship }
}

export async function redirectToSelectedChampionshipPage(page: 'predictions' | 'results' | 'leaderboard') {
  const session = await requireAuth()
  const selected = await getSelectedChampionship(session.userId!)
  if (!selected) redirect('/')
  redirect(`/championships/${selected.id}/${page}`)
}

export async function userHasActiveChampionship(userId: number): Promise<boolean> {
  const count = await prisma.championshipMember.count({
    where: { userId, championship: { isActive: true } },
  })
  return count > 0
}
