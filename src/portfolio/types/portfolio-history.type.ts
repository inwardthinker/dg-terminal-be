export type HistoryPeriod = '7d' | '30d' | '90d' | 'all';

export interface BalanceSnapshot {
  date: string;
  balance_value: number;
}

export interface BalanceSnapshotRow {
  date: string;
  balance_value: string | number | null;
}
