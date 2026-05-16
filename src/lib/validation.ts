import type { PredictionType } from './types'

const MAX_GOALS_PER_TEAM = 10;
type ScoreOutcome = '1' | 'X' | '2';

/**
 * Validates whether a new prediction type can be added alongside existing
 * predictions for the same match.
 *
 * Rules:
 * - SINGLE_OUTCOME and DOUBLE_CHANCE are mutually exclusive.
 * - EXACT_SCORE may coexist with either SINGLE_OUTCOME or DOUBLE_CHANCE.
 * - No duplicate prediction types are allowed.
 *
 * @returns null if the combination is allowed, or an error message string.
 */
export function validatePredictionCombination(
  incoming: PredictionType,
  existing: { type: PredictionType }[]
): string | null {
  const existingTypes = existing.map((p) => p.type);

  // Duplicate check
  if (existingTypes.includes(incoming)) {
    switch (incoming) {
      case 'SINGLE_OUTCOME':
        return 'You already have a single outcome prediction for this match';
      case 'DOUBLE_CHANCE':
        return 'You already have a double chance prediction for this match';
      case 'EXACT_SCORE':
        return 'You already have an exact score prediction for this match';
    }
  }

  // Mutual exclusion between SINGLE_OUTCOME and DOUBLE_CHANCE
  if (
    incoming === 'DOUBLE_CHANCE' &&
    existingTypes.includes('SINGLE_OUTCOME')
  ) {
    return 'Cannot combine single outcome (1/X/2) with double chance (1X/X2/12)';
  }

  if (
    incoming === 'SINGLE_OUTCOME' &&
    existingTypes.includes('DOUBLE_CHANCE')
  ) {
    return 'Cannot combine single outcome (1/X/2) with double chance (1X/X2/12)';
  }

  return null;
}

/**
 * Parses a score string in "home-away" format (e.g. "2-1").
 *
 * Constraints:
 * - Both values must be non-negative integers.
 * - Neither value may exceed MAX_GOALS_PER_TEAM (10).
 *
 * @returns { home, away } on success, or null if the input is invalid.
 */
export function parseExactScore(
  value: string
): { home: number; away: number } | null {
  const match = /^(\d+)-(\d+)$/.exec(value);
  if (!match) return null;

  const home = parseInt(match[1], 10);
  const away = parseInt(match[2], 10);

  if (home > MAX_GOALS_PER_TEAM || away > MAX_GOALS_PER_TEAM) return null;

  return { home, away };
}

export function getScoreOutcome(home: number, away: number): ScoreOutcome {
  if (home > away) return '1';
  if (home < away) return '2';
  return 'X';
}

export function predictionAllowsScore(
  prediction: { type: PredictionType; value: string },
  score: { home: number; away: number }
): boolean {
  const outcome = getScoreOutcome(score.home, score.away);

  if (prediction.type === 'SINGLE_OUTCOME') return prediction.value === outcome;
  if (prediction.type === 'DOUBLE_CHANCE') return prediction.value.includes(outcome);
  return true;
}

export function validateExactScoreAgainstSelections(
  score: { home: number; away: number },
  existing: { type: PredictionType; value: string }[]
): string | null {
  const selection = existing.find((prediction) => prediction.type === 'SINGLE_OUTCOME' || prediction.type === 'DOUBLE_CHANCE');
  if (!selection || predictionAllowsScore(selection, score)) return null;

  return selection.type === 'SINGLE_OUTCOME'
    ? 'Exact score must match your 1/X/2 prediction'
    : 'Exact score must match your double chance prediction';
}

export function validateSelectionsAgainstExactScore(
  incoming: { type: PredictionType; value: string },
  existing: { type: PredictionType; value: string }[]
): string | null {
  if (incoming.type !== 'SINGLE_OUTCOME' && incoming.type !== 'DOUBLE_CHANCE') return null;

  const exact = existing.find((prediction) => prediction.type === 'EXACT_SCORE');
  if (!exact) return null;

  const score = parseExactScore(exact.value);
  if (!score || predictionAllowsScore(incoming, score)) return null;

  return incoming.type === 'SINGLE_OUTCOME'
    ? 'Match result must match your exact score'
    : 'Double chance must match your exact score';
}
