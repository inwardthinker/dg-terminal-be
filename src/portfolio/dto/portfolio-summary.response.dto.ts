export class PortfolioSummaryResponseDto {
  balance!: number;
  open_exposure!: number;
  unrealized_pnl!: number;
  realized_30d!: number;
  rewards_earned!: number;
  rewards_pct_of_pnl!: number | null;
  deployment_rate_pct!: number | null;
  balance_last_updated!: string | null;
  open_exposure_last_updated!: string | null;
  unrealized_pnl_last_updated!: string | null;
  realized_30d_last_updated!: string | null;
  rewards_last_updated!: string | null;
}
