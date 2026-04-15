export class PortfolioPositionResponseDto {
  market_name!: string;
  category!: string;
  venue!: string;
  side!: string;
  avg_entry_price!: number;
  current_price!: number;
  shares!: number;
  cost_basis!: number;
  unrealized_pnl!: number;
  /** Return on cost basis (ratio), e.g. 1.56 = +156% vs entry. */
  unrealized_pnl_pct!: number;
  exposure!: number;

  /** Market condition id (`conditionId`). */
  condition_id!: string;
  /** Outcome ERC1155 token id (`asset`). */
  outcome_token_id!: string;
  proxy_wallet!: string;
  slug!: string;
  icon!: string;
  event_id!: string;
  event_slug!: string;
  outcome_index!: number;
  opposite_outcome!: string;
  opposite_asset!: string;
  /** ISO date string from Data API (`endDate`). */
  end_date!: string;
  redeemable!: boolean;
  mergeable!: boolean;
  negative_risk!: boolean;
  /** Total shares bought (`totalBought`). */
  total_bought!: number;
  /** Realized PnL on open row (`realizedPnl`, often 0 while still open). */
  realized_pnl!: number;
  /** Data API `percentRealizedPnl`. */
  percent_realized_pnl!: number;
  /** Same basis as `cost_basis` when Data API sends `initialValue`. */
  initial_value!: number;
  /** Same basis as `exposure` when Data API sends `currentValue`. */
  current_value!: number;
  /** Data API `percentPnl` (display-oriented, e.g. 156.41). */
  percent_pnl!: number;
}
