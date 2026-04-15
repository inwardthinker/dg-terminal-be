/** Normalized closed position row from Polymarket Data API (`/closed-positions`) before mapping to portfolio DTO. */
export interface PolymarketRawClosedPosition {
  market: string;
  /** Market condition id (`conditionId`) — Gamma category lookup key. */
  condition_id: string;
  /** Outcome token id (`asset`). */
  outcome_token_id?: string;
  proxy_wallet?: string;
  category?: string;
  side: string;
  /** Total shares bought (`totalBought`). */
  size: string;
  avg_price: string;
  cur_price: string;
  realized_pnl: string;
  end_date: string;
  /** Unix seconds from Data API `timestamp`. */
  timestamp: number;
  slug?: string;
  icon?: string;
  event_id?: string;
  event_slug?: string;
  outcome_index?: string;
  opposite_outcome?: string;
  opposite_asset?: string;
}
