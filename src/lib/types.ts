export const VALID_PREDICTION_TYPES = ['SINGLE_OUTCOME', 'DOUBLE_CHANCE', 'EXACT_SCORE'] as const
export type PredictionType = typeof VALID_PREDICTION_TYPES[number]

export type Stage =
  | 'GROUP'
  | 'ROUND_OF_32'
  | 'ROUND_OF_16'
  | 'QUARTER_FINAL'
  | 'SEMI_FINAL'
  | 'THIRD_PLACE'
  | 'FINAL'
