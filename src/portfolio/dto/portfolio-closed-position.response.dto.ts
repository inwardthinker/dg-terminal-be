export class PortfolioClosedPositionResponseDto {
  market_name!: string;
  category!: string;
  venue!: string;
  side!: string;
  avg_entry_price!: number;
  current_price!: number;
  shares!: number;
  cost_basis!: number;
  realized_pnl!: number;
  /** Return on estimated cost (`realized_pnl / cost_basis` where cost_basis = shares × avg_entry). */
  realized_pnl_pct!: number;
  end_date!: string;
  closed_at!: string;

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
}
