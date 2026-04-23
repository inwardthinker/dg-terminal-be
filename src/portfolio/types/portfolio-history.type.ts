export type HistoryPeriod = '7d' | '30d' | '90d' | 'all';

export interface BalanceSnapshot {
  date: string;
  balanceValue: number;
}

export interface HistoryPoint extends BalanceSnapshot {
  dailyChange: number;
}

export interface BalanceSnapshotRow {
  date: string;
  balance_value: string | number | null;
}

export interface HistoryRange {
  startIndex: number;
  endIndex: number;
  pointsCount: number;
  insufficientHistory: boolean;
  startValue: number;
  endValue: number;
  changePct: number;
}

export interface PortfolioHistoryResponse {
  userId: number;
  asOfDate: string | null;
  points: HistoryPoint[];
  ranges: Record<HistoryPeriod, HistoryRange>;
}
