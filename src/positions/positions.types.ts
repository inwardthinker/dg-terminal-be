export interface OpenPosition {
  asset: string;
  size: number;
  eventId?: string;
  category?: Category;
  endDate?: string;
  outcome?: string;
  title?: string;
  avgPrice?: number;
  currentValue?: number;
  initialValue?: number;
  cashPnl?: number;
  percentPnl?: number;
  totalBought?: number;
  realizedPnl?: number;
  percentRealizedPnl?: number;
  curPrice?: number;
  redeemable?: boolean;
  mergeable?: boolean;
}

export type Category = 'Sports' | 'Politics' | 'Crypto' | 'Macro' | 'Other';

export interface PositionPriceEvent {
  position_id: string;
  no_of_shares: number;
  category: Category;
  outcome: string | null;
  title: string | null;
  avg_price: number | null;
  current_price: number | null;
  position_value: number | null;
  pnl_amount: number | null;
  pnl_percent: number | null;
  stale: boolean;
}

export interface MarketPriceUpdate {
  assetId?: string;
  currentPrice?: number;
  stale: boolean;
}
