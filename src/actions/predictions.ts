'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { validatePredictionCombination, parseExactScore } from '@/lib/validation'

type PredictionType = 'SINGLE_OUTCOME' | 'DOUBLE_CHANCE' | 'EXACT_SCORE'

export async function savePrediction(prevState: unknown, formData: FormData) {
  const session = await requireAuth()
  const matchId = parseInt(formData.get('matchId') as string, 10)
  const type = formData.get('type') as PredictionType
  const value = (formData.get('value') as string)?.trim()
  const championshipId = parseInt(formData.get('championshipId') as string, 10)

  if (!matchId || !type || !value || !championshipId) return { error: 'Missing fields' }

  const [match, membership] = await Promise.all([
    prisma.match.findUnique({ where: { id: matchId } }),
    prisma.championshipMember.findFirst({
      where: { userId: session.userId!, championshipId },
      include: { championship: true },
    }),
  ])

  if (!match) return { error: 'Match not found' }
  if (match.kickoff <= new Date()) return { error: 'Predictions are locked for this match' }
  if (!membership) return { error: 'You are not a member of this championship' }
  if (type === 'DOUBLE_CHANCE' && !membership.championship.doubleChanceEnabled) {
    return { error: 'Double chance is not enabled for this championship' }
  }

  if (type === 'EXACT_SCORE') {
    const parsed = parseExactScore(value)
    if (!parsed) return { error: 'Invalid score format. Use e.g. 2-1' }
  }

  const existing = await prisma.prediction.findMany({
    where: { userId: session.userId!, matchId, championshipId },
  })

  const existingOtherTypes = existing.filter((p) => p.type !== type)
  const validationError = validatePredictionCombination(type, existingOtherTypes)
  if (validationError) return { error: validationError }

  await prisma.prediction.upsert({
    where: { userId_matchId_type_championshipId: { userId: session.userId!, matchId, type, championshipId } },
    update: { value },
    create: { userId: session.userId!, matchId, type, value, championshipId },
  })

  revalidatePath(`/championships/${championshipId}/predictions`)
  return { success: true }
}

export async function deletePrediction(prevState: unknown, formData: FormData) {
  const session = await requireAuth()
  const predictionId = parseInt(formData.get('predictionId') as string, 10)

  const prediction = await prisma.prediction.findUnique({
    where: { id: predictionId },
    include: { match: true },
  })
  if (!prediction || prediction.userId !== session.userId) return { error: 'Not found' }
  if (prediction.match.kickoff <= new Date()) return { error: 'Cannot delete after kickoff' }

  await prisma.prediction.delete({ where: { id: predictionId } })
  revalidatePath(`/championships/${prediction.championshipId}/predictions`)
  return { success: true }
}

export async function saveKnockoutAdvance(prevState: unknown, formData: FormData) {
  const session = await requireAuth()
  const matchId = parseInt(formData.get('matchId') as string, 10)
  const predictedTeam = (formData.get('predictedTeam') as string)?.trim()
  const championshipId = parseInt(formData.get('championshipId') as string, 10)

  if (!matchId || !predictedTeam || !championshipId) return { error: 'Missing fields' }

  const [match, membership] = await Promise.all([
    prisma.match.findUnique({ where: { id: matchId } }),
    prisma.championshipMember.findFirst({ where: { userId: session.userId!, championshipId } }),
  ])

  if (!match) return { error: 'Match not found' }
  if (match.stage === 'GROUP') return { error: 'Advance prediction only for knockout rounds' }
  if (match.kickoff <= new Date()) return { error: 'Predictions are locked for this match' }
  if (!membership) return { error: 'You are not a member of this championship' }
  if (![match.homeTeam, match.awayTeam].includes(predictedTeam)) return { error: 'Choose one of the teams in this match' }

  await prisma.knockoutAdvance.upsert({
    where: { userId_matchId_championshipId: { userId: session.userId!, matchId, championshipId } },
    update: { predictedTeam },
    create: { userId: session.userId!, matchId, predictedTeam, championshipId },
  })

  revalidatePath(`/championships/${championshipId}/predictions`)
  return { success: true }
}

export async function resetMatchPredictions(prevState: unknown, formData: FormData) {
  const session = await requireAuth()
  const matchId = parseInt(formData.get('matchId') as string, 10)
  const championshipId = parseInt(formData.get('championshipId') as string, 10)

  if (!matchId || !championshipId) return { error: 'Missing fields' }

  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match) return { error: 'Match not found' }
  if (match.kickoff <= new Date()) return { error: 'Match has already started — predictions are locked' }

  await prisma.prediction.deleteMany({ where: { userId: session.userId!, matchId, championshipId } })
  await prisma.knockoutAdvance.deleteMany({ where: { userId: session.userId!, matchId, championshipId } })

  revalidatePath(`/championships/${championshipId}/predictions`)
  return { success: true }
}
