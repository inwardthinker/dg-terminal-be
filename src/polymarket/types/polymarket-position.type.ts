/**
 * Normalized open position row from Polymarket Data API (`/positions`) before mapping to portfolio DTO.
 * String fields mirror API scalars; booleans may arrive as JSON booleans and are normalized in `toRawPosition`.
 */
export interface PolymarketRawPosition {
  market: string;
  /** Market condition id (`conditionId`) — Gamma category lookup key. */
  condition_id: string;
  /** Outcome token id (`asset` on the Data API). */
  outcome_token_id?: string;
  proxy_wallet?: string;
  category?: string;
  side: string;
  size: string;
  avg_price: string;
  cur_price: string;
  /** From Data API `initialValue` — when set with `current_value`, PnL fields prefer API metrics. */
  initial_value?: string;
  current_value?: string;
  cash_pnl?: string;
  /** Data API `percentPnl` (e.g. 156.41) — display-style %, not the same scale as computed `unrealized_pnl_pct`. */
  percent_pnl?: string;
  total_bought?: string;
  realized_pnl?: string;
  percent_realized_pnl?: string;
  slug?: string;
  icon?: string;
  event_id?: string;
  event_slug?: string;
  outcome_index?: string;
  opposite_outcome?: string;
  opposite_asset?: string;
  end_date?: string;
  redeemable?: string;
  mergeable?: string;
  negative_risk?: string;
}
