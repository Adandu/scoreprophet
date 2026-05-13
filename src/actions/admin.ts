'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { calculatePredictionPoints, calculateAdvancePoints } from '@/lib/scoring'
import type { PredictionType } from '@/lib/scoring'

export async function overrideMatchScore(prevState: unknown, formData: FormData) {
  await requireAdmin()
  const matchId = parseInt(formData.get('matchId') as string, 10)
  const homeScore = parseInt(formData.get('homeScore') as string, 10)
  const awayScore = parseInt(formData.get('awayScore') as string, 10)
  const winnerTeam = (formData.get('winnerTeam') as string)?.trim() || null

  if (isNaN(homeScore) || isNaN(awayScore)) return { error: 'Invalid scores' }
  if (homeScore < 0 || awayScore < 0 || homeScore > 20 || awayScore > 20) return { error: 'Scores must be between 0 and 20' }

  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match) return { error: 'Match not found' }
  if (match.stage !== 'GROUP') {
    if (!winnerTeam) return { error: 'Advancing team is required for knockout matches' }
    if (![match.homeTeam, match.awayTeam].includes(winnerTeam)) return { error: 'Advancing team must match one of the teams in this match' }
  }

  await prisma.match.update({
    where: { id: matchId },
    data: { homeScore, awayScore, winnerTeam, status: 'FINISHED', adminOverride: true },
  })

  await recalculateMatchPoints(matchId)
  revalidatePath('/admin')
  revalidatePath('/results')
  revalidatePath('/leaderboard')
  return { success: true }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function recalculateAllPoints(prevState: unknown) {
  await requireAdmin()
  const matches = await prisma.match.findMany({ where: { status: 'FINISHED' } })
  for (const match of matches) {
    await recalculateMatchPoints(match.id)
  }
  revalidatePath('/results')
  revalidatePath('/leaderboard')
  return { success: true, count: matches.length }
}

async function recalculateMatchPoints(matchId: number) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { predictions: true, advances: true },
  })
  if (!match || match.homeScore === null || match.awayScore === null) return

  for (const pred of match.predictions) {
    const pts = calculatePredictionPoints(pred.type as PredictionType, pred.value, match.homeScore, match.awayScore)
    await prisma.prediction.update({ where: { id: pred.id }, data: { pointsAwarded: pts } })
  }

  for (const advance of match.advances) {
    const pts = match.winnerTeam
      ? calculateAdvancePoints(advance.predictedTeam, match.winnerTeam)
      : 0
    await prisma.knockoutAdvance.update({ where: { id: advance.id }, data: { pointsAwarded: pts } })
  }
}

export async function removeUser(prevState: unknown, formData: FormData) {
  const session = await requireAdmin()
  const userId = parseInt(formData.get('userId') as string, 10)
  if (!userId) return { error: 'Missing user ID' }
  if (userId === session.userId) return { error: 'You cannot remove your own account' }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return { error: 'User not found' }
  if (user.isAdmin) return { error: 'Admin users cannot be removed here' }
  await prisma.user.delete({ where: { id: userId } })
  revalidatePath('/admin')
  return { success: true }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function syncMatchesFromApi(prevState: unknown) {
  await requireAdmin()
  const { fetchAllMatches } = await import('@/lib/football-api')
  try {
    const matches = await fetchAllMatches()
    let synced = 0
    for (const m of matches) {
      await prisma.match.upsert({
        where: { externalId: m.externalId },
        update: {
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          homeTeamCrest: m.homeTeamCrest,
          awayTeamCrest: m.awayTeamCrest,
          stage: m.stage,
          group: m.group,
          kickoff: m.kickoff,
          status: m.status,
          homeScore: m.homeScore,
          awayScore: m.awayScore,
        },
        create: {
          externalId: m.externalId,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          homeTeamCrest: m.homeTeamCrest,
          awayTeamCrest: m.awayTeamCrest,
          stage: m.stage,
          group: m.group,
          kickoff: m.kickoff,
          status: m.status,
          homeScore: m.homeScore,
          awayScore: m.awayScore,
        },
      })
      synced++
    }

    // Also sync teams
    try {
      const { fetchAllTeams } = await import('@/lib/football-api')
      const teams = await fetchAllTeams()
      for (const t of teams) {
        await prisma.team.upsert({
          where: { externalId: t.externalId },
          update: {
            name: t.name,
            shortName: t.shortName,
            tla: t.tla,
            crest: t.crest,
            areaName: t.areaName,
            areaCode: t.areaCode,
            address: t.address,
            website: t.website,
            founded: t.founded,
            clubColors: t.clubColors,
            venue: t.venue,
            coachName: t.coachName,
            squadJson: t.squadJson,
            staffJson: t.staffJson,
            runningCompetitionsJson: t.runningCompetitionsJson,
            rawJson: t.rawJson,
          },
          create: t,
        })
      }
    } catch {
      // Teams API may not be available — non-fatal
    }

    const finished = await prisma.match.findMany({
      where: { status: 'FINISHED', predictions: { some: { pointsAwarded: null } } },
    })
    for (const match of finished) await recalculateMatchPoints(match.id)

    revalidatePath('/admin')
    revalidatePath('/results')
    revalidatePath('/leaderboard')
    revalidatePath('/teams')
    return { success: true, synced }
  } catch (err) {
    return { error: String(err) }
  }
}
