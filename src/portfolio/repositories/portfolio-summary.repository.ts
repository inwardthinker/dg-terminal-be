import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/database.constants';
import { PortfolioSummaryResponseDto } from '../dto/portfolio-summary.response.dto';

@Injectable()
export class PortfolioSummaryRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByWallet(
    safeWalletAddress: string,
  ): Promise<PortfolioSummaryResponseDto | null> {
    const result = await this.pool.query(
      `
      SELECT
        COALESCE(SUM(balance), 0)::float8 AS balance,
        COALESCE(SUM(open_exposure), 0)::float8 AS open_exposure,
        COALESCE(SUM(unrealized_pnl), 0)::float8 AS unrealized_pnl,
        COALESCE(SUM(realized_30d), 0)::float8 AS realized_30d,
        COALESCE(SUM(rewards_earned), 0)::float8 AS rewards_earned,
        CASE
          WHEN SUM(realized_30d) > 0
            THEN (COALESCE(SUM(rewards_earned), 0) / SUM(realized_30d)) * 100
          ELSE NULL
        END::float8 AS rewards_pct_of_pnl,
        CASE
          WHEN (COALESCE(SUM(balance), 0) + COALESCE(SUM(open_exposure), 0)) > 0
            THEN (
              COALESCE(SUM(open_exposure), 0)
              / (COALESCE(SUM(balance), 0) + COALESCE(SUM(open_exposure), 0))
            ) * 100
          ELSE NULL
        END::float8 AS deployment_rate_pct,
        MIN(balance_last_updated) AS balance_last_updated,
        MIN(open_exposure_last_updated) AS open_exposure_last_updated,
        MIN(unrealized_pnl_last_updated) AS unrealized_pnl_last_updated,
        MIN(realized_30d_last_updated) AS realized_30d_last_updated,
        MIN(rewards_last_updated) AS rewards_last_updated
      FROM portfolio_summary
      WHERE safe_wallet_address = $1
      `,
      [safeWalletAddress],
    );

    if (result.rows.length === 0) return null;
    return mapSummaryRow(result.rows[0] as Record<string, unknown>);
  }
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toNullableIsoString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean' &&
    typeof value !== 'bigint'
  ) {
    return null;
  }
  const asString = `${value}`.trim();
  if (!asString) return null;
  const parsed = new Date(asString);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function mapSummaryRow(
  row: Record<string, unknown>,
): PortfolioSummaryResponseDto {
  return {
    balance: toNumber(row.balance),
    open_exposure: toNumber(row.open_exposure),
    unrealized_pnl: toNumber(row.unrealized_pnl),
    realized_30d: toNumber(row.realized_30d),
    rewards_earned: toNumber(row.rewards_earned),
    rewards_pct_of_pnl: toNullableNumber(row.rewards_pct_of_pnl),
    deployment_rate_pct: toNullableNumber(row.deployment_rate_pct),
    balance_last_updated: toNullableIsoString(row.balance_last_updated),
    open_exposure_last_updated: toNullableIsoString(
      row.open_exposure_last_updated,
    ),
    unrealized_pnl_last_updated: toNullableIsoString(
      row.unrealized_pnl_last_updated,
    ),
    realized_30d_last_updated: toNullableIsoString(
      row.realized_30d_last_updated,
    ),
    rewards_last_updated: toNullableIsoString(row.rewards_last_updated),
  };
}
