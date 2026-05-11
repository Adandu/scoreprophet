import { redirectToSelectedChampionshipPage } from '@/lib/championships'

export default async function PredictionsPage() {
  await redirectToSelectedChampionshipPage('predictions')
}
