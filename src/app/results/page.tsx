import { redirectToSelectedChampionshipPage } from '@/lib/championships'

export default async function ResultsPage() {
  await redirectToSelectedChampionshipPage('results')
}
