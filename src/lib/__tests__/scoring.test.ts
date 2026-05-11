import { describe, it, expect } from 'vitest';
import { calculatePredictionPoints, calculateAdvancePoints } from '@/lib/scoring';

describe('calculatePredictionPoints - SINGLE_OUTCOME', () => {
  it('awards 3 points for correct prediction of home win (1)', () => {
    expect(calculatePredictionPoints('SINGLE_OUTCOME', '1', 2, 0)).toBe(3);
  });

  it('awards 3 points for correct prediction of draw (X)', () => {
    expect(calculatePredictionPoints('SINGLE_OUTCOME', 'X', 1, 1)).toBe(3);
  });

  it('awards 3 points for correct prediction of away win (2)', () => {
    expect(calculatePredictionPoints('SINGLE_OUTCOME', '2', 0, 1)).toBe(3);
  });

  it('awards 0 points for incorrect single outcome prediction', () => {
    expect(calculatePredictionPoints('SINGLE_OUTCOME', '1', 0, 2)).toBe(0);
  });
});

describe('calculatePredictionPoints - DOUBLE_CHANCE', () => {
  it('awards 1 point for 1X when result is home win', () => {
    expect(calculatePredictionPoints('DOUBLE_CHANCE', '1X', 3, 1)).toBe(1);
  });

  it('awards 1 point for 1X when result is draw', () => {
    expect(calculatePredictionPoints('DOUBLE_CHANCE', '1X', 0, 0)).toBe(1);
  });

  it('awards 1 point for X2 when result is away win', () => {
    expect(calculatePredictionPoints('DOUBLE_CHANCE', 'X2', 1, 3)).toBe(1);
  });

  it('awards 1 point for 12 when result is home win', () => {
    expect(calculatePredictionPoints('DOUBLE_CHANCE', '12', 2, 0)).toBe(1);
  });

  it('awards 0 points for incorrect double chance prediction', () => {
    expect(calculatePredictionPoints('DOUBLE_CHANCE', '12', 1, 1)).toBe(0);
  });
});

describe('calculatePredictionPoints - EXACT_SCORE', () => {
  it('awards 5 points for exact score match', () => {
    expect(calculatePredictionPoints('EXACT_SCORE', '2-1', 2, 1)).toBe(5);
  });

  it('awards 5 points for exact score match with 0-0', () => {
    expect(calculatePredictionPoints('EXACT_SCORE', '0-0', 0, 0)).toBe(5);
  });

  it('awards 0 points when home score is wrong', () => {
    expect(calculatePredictionPoints('EXACT_SCORE', '3-1', 2, 1)).toBe(0);
  });

  it('awards 0 points when away score is wrong', () => {
    expect(calculatePredictionPoints('EXACT_SCORE', '2-0', 2, 1)).toBe(0);
  });
});

describe('calculateAdvancePoints', () => {
  it('awards 1 point when predicted team matches actual winner', () => {
    expect(calculateAdvancePoints('TeamA', 'TeamA')).toBe(1);
  });

  it('awards 0 points when predicted team does not match actual winner', () => {
    expect(calculateAdvancePoints('TeamA', 'TeamB')).toBe(0);
  });

  it('is case-sensitive when comparing teams', () => {
    expect(calculateAdvancePoints('teama', 'TeamA')).toBe(0);
  });

  it('awards 1 point for exact string match including spaces', () => {
    expect(calculateAdvancePoints('Real Madrid', 'Real Madrid')).toBe(1);
  });
});
