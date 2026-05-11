export type PredictionType = 'SINGLE_OUTCOME' | 'DOUBLE_CHANCE' | 'EXACT_SCORE';

function getOutcome(homeScore: number, awayScore: number): '1' | 'X' | '2' {
  if (homeScore > awayScore) return '1';
  if (homeScore === awayScore) return 'X';
  return '2';
}

const DOUBLE_CHANCE_MAP: Record<string, Array<'1' | 'X' | '2'>> = {
  '1X': ['1', 'X'],
  'X2': ['X', '2'],
  '12': ['1', '2'],
};

export function calculatePredictionPoints(
  type: PredictionType,
  value: string,
  homeScore: number,
  awayScore: number
): number {
  const outcome = getOutcome(homeScore, awayScore);

  switch (type) {
    case 'SINGLE_OUTCOME':
      return value === outcome ? 3 : 0;

    case 'DOUBLE_CHANCE': {
      const covers = DOUBLE_CHANCE_MAP[value] ?? [];
      return covers.includes(outcome) ? 1 : 0;
    }

    case 'EXACT_SCORE': {
      const [predictedHome, predictedAway] = value.split('-').map(Number);
      return predictedHome === homeScore && predictedAway === awayScore ? 5 : 0;
    }

    default:
      return 0;
  }
}

export function calculateAdvancePoints(
  predictedTeam: string,
  actualWinner: string
): number {
  return predictedTeam === actualWinner ? 1 : 0;
}
