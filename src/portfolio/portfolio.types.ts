export type HistoryPeriod = '7d' | '30d' | '90d' | 'all';

export interface BalanceSnapshot {
  date: string;
  balance_value: number;
}

export interface EquityCurvePoint {
  date: string;
  balanceValue: number;
  dailyChange: number;
}

export interface EquityCurveRange {
  startIndex: number;
  endIndex: number;
  pointsCount: number;
  insufficientHistory: boolean;
}

export interface EquityCurveResponse {
  userId: number;
  asOfDate: string;
  points: EquityCurvePoint[];
  ranges: Record<string, EquityCurveRange>;
}
