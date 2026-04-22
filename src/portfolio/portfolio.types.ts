export type HistoryPeriod = '7d' | '30d' | '90d' | 'all';

export type BalanceSnapshot = {
  date: string;
  balance_value: number;
};

export type BalanceSnapshotRow = {
  date: string;
  balance_value: string | number | null;
};

export type ClosePositionRequest =
  | {
      type: 'full';
      percentage?: never;
    }
  | {
      type: 'partial';
      percentage: number;
    };

export type ClosePositionResult =
  | {
      realized_pnl: number;
      closed_at: string;
      remaining_size?: never;
      avg_entry_price?: never;
    }
  | {
      realized_pnl: number;
      remaining_size: number;
      avg_entry_price: number;
      closed_at?: never;
    };

export type PortfolioKpis = {
  balance: number;
  open_exposure: number;
  unrealized_pnl: number;
  realized_30d: number;
  rewards_earned: number;
};

export type PortfolioKpisRow = {
  balance: string | number | null;
  open_exposure: string | number | null;
  unrealized_pnl: string | number | null;
  realized_30d: string | number | null;
  rewards_earned: string | number | null;
};
