import { redirectToSelectedChampionshipPage } from '@/lib/championships'

export default async function ChampionshipsPage() {
  await redirectToSelectedChampionshipPage('leaderboard')
}
