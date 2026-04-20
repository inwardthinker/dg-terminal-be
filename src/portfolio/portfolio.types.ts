export type HistoryPeriod = '7d' | '30d' | '90d' | 'all';

export interface BalanceSnapshot {
  date: string;
  balance_value: number;
}

export interface BalanceSnapshotRow {
  date: string;
  balance_value: string | number;
}

export type CloseType = 'full' | 'partial';

export interface ClosePositionRequest {
  type: CloseType;
  percentage?: number;
}

export interface ClosePositionResult {
  realized_pnl: number;
  closed_at?: string;
  remaining_size?: number;
  avg_entry_price?: number;
}
