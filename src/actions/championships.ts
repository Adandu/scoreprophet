'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireAdmin, requireAuth } from '@/lib/auth'
import { getSession } from '@/lib/session'

function parseId(value: FormDataEntryValue | null): number | null {
  const id = parseInt(String(value ?? ''), 10)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function createChampionship(prevState: unknown, formData: FormData) {
  await requireAdmin()
  const name = (formData.get('name') as string)?.trim()
  const description = ((formData.get('description') as string) ?? '').trim()

  if (!name || name.length < 2 || name.length > 60) return { error: 'Championship name must be 2-60 characters' }

  try {
    await prisma.championship.create({ data: { name, description } })
  } catch {
    return { error: 'Championship name already exists' }
  }

  revalidatePath('/admin')
  revalidatePath('/', 'layout')
  return { success: true }
}

export async function updateChampionship(prevState: unknown, formData: FormData) {
  await requireAdmin()
  const championshipId = parseId(formData.get('championshipId'))
  const name = (formData.get('name') as string)?.trim()
  const description = ((formData.get('description') as string) ?? '').trim()
  const isActive = formData.get('isActive') === 'on'
  const doubleChanceEnabled = formData.get('doubleChanceEnabled') === 'on'

  if (!championshipId) return { error: 'Missing championship ID' }
  if (!name || name.length < 2 || name.length > 60) return { error: 'Championship name must be 2-60 characters' }

  try {
    await prisma.championship.update({
      where: { id: championshipId },
      data: { name, description, isActive, doubleChanceEnabled },
    })
  } catch {
    return { error: 'Could not update championship' }
  }

  revalidatePath('/admin')
  revalidatePath('/', 'layout')
  revalidatePath(`/championships/${championshipId}/leaderboard`)
  revalidatePath(`/championships/${championshipId}/predictions`)
  return { success: true }
}

export async function deleteChampionship(prevState: unknown, formData: FormData) {
  await requireAdmin()
  const championshipId = parseId(formData.get('championshipId'))
  if (!championshipId) return { error: 'Missing championship ID' }

  await prisma.championship.delete({ where: { id: championshipId } })
  revalidatePath('/admin')
  revalidatePath('/', 'layout')
  return { success: true }
}

export async function setChampionshipMembers(prevState: unknown, formData: FormData) {
  await requireAdmin()
  const championshipId = parseId(formData.get('championshipId'))
  if (!championshipId) return { error: 'Missing championship ID' }

  const userIds = Array.from(new Set(
    formData
      .getAll('userIds')
      .map((value) => parseId(value))
      .filter((id): id is number => id !== null)
  ))

  const championship = await prisma.championship.findUnique({ where: { id: championshipId } })
  if (!championship) return { error: 'Championship not found' }

  await prisma.$transaction([
    prisma.championshipMember.deleteMany({ where: { championshipId } }),
    ...userIds.map((userId) =>
      prisma.championshipMember.create({
        data: { championshipId, userId },
      })
    ),
  ])

  revalidatePath('/admin')
  revalidatePath('/', 'layout')
  revalidatePath(`/championships/${championshipId}/leaderboard`)
  return { success: true }
}

export async function selectChampionship(championshipId: number) {
  const auth = await requireAuth()
  const membership = await prisma.championshipMember.findFirst({
    where: { userId: auth.userId, championshipId, championship: { isActive: true } },
  })
  if (!membership && !auth.isAdmin) return { error: 'Championship not available' }

  const session = await getSession()
  session.selectedChampionshipId = championshipId
  await session.save()
  revalidatePath('/', 'layout')
  return { success: true }
}
