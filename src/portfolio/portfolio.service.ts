import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';
import {
  BalanceSnapshot,
  BalanceSnapshotRow,
  ClosePositionRequest,
  ClosePositionResult,
  HistoryPeriod,
} from './portfolio.types';

@Injectable()
export class PortfolioService implements OnModuleDestroy {
  private readonly logger = new Logger(PortfolioService.name);
  private readonly pool: Pool;
  private readonly venueOrderUrl?: string;
  private readonly venueTimeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    const connectionString =
      this.configService.getOrThrow<string>('DATABASE_URL');
    this.venueOrderUrl = this.configService.get<string>('VENUE_ORDER_URL');
    this.venueTimeoutMs = Number(
      this.configService.get<string>('VENUE_ORDER_TIMEOUT_MS') ?? '1500',
    );

    this.pool = new Pool({ connectionString });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async getHistory(
    userId: string,
    period: HistoryPeriod,
  ): Promise<BalanceSnapshot[]> {
    const points = await this.fetchSnapshotsFromDb(userId, period);

    if (points.length < 3) {
      return [];
    }

    return points.map((point) => ({
      date: point.date,
      balance_value: Number(point.balance_value),
    }));
  }

  private async fetchSnapshotsFromDb(
    userId: string,
    period: HistoryPeriod,
  ): Promise<BalanceSnapshotRow[]> {
    const query = `
      WITH latest AS (
        SELECT MAX(snapshot_date) AS max_date
        FROM silver_dgterminal.polymarket_equity_snapshots_user
        WHERE user_id = $1::BIGINT
      ),
      raw AS (
        SELECT
          snapshot_date::date AS snapshot_date,
          balance_value
        FROM silver_dgterminal.polymarket_equity_snapshots_user
        WHERE user_id = $1::BIGINT
          AND (
            $2::text = 'all'
            OR snapshot_date >= (
              (SELECT max_date FROM latest) -
              CASE
                WHEN $2::text = '7d' THEN INTERVAL '6 days'
                WHEN $2::text = '30d' THEN INTERVAL '29 days'
                WHEN $2::text = '90d' THEN INTERVAL '89 days'
                ELSE INTERVAL '0 days'
              END
            )
          )
      ),
      date_bounds AS (
        SELECT MIN(snapshot_date) AS min_date, MAX(snapshot_date) AS max_date
        FROM raw
      ),
      series AS (
        SELECT day::date AS date
        FROM date_bounds,
          LATERAL generate_series(min_date, max_date, INTERVAL '1 day') AS day
      )
      SELECT
        s.date::text AS date,
        (
          SELECT r.balance_value
          FROM raw r
          WHERE r.snapshot_date <= s.date
          ORDER BY r.snapshot_date DESC
          LIMIT 1
        ) AS balance_value
      FROM series s
      ORDER BY s.date ASC;
    `;

    try {
      const { rows } = await this.pool.query<BalanceSnapshotRow>(query, [
        userId,
        period,
      ]);
      return rows.filter((row) => row.balance_value !== null);
    } catch (error) {
      this.logger.error(
        `Failed fetching portfolio history for userId=${userId}, period=${period}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async closePosition(
    userId: string,
    positionId: string,
    request: ClosePositionRequest,
  ): Promise<ClosePositionResult> {
    const existingPosition = await this.fetchPosition(userId, positionId);
    const currentShares = Number(existingPosition.shares ?? 0);
    if (currentShares <= 0) {
      throw new ConflictException({
        code: 'POSITION_ALREADY_CLOSED',
        message: 'Position is already closed',
      });
    }

    const avgEntryPrice = Number(existingPosition.avg_entry_price ?? 0);
    const currentPrice = Number(
      existingPosition.current_price ?? existingPosition.avg_entry_price ?? 0,
    );
    const closeFraction =
      request.type === 'full' ? 1 : Number(request.percentage ?? 0) / 100;
    const closeShares = Number((currentShares * closeFraction).toFixed(6));
    const remainingShares = Number((currentShares - closeShares).toFixed(6));
    const realizedPnl = Number(
      ((currentPrice - avgEntryPrice) * closeShares).toFixed(6),
    );
    const closedAt = new Date().toISOString();

    await this.executeMarketSell(positionId, closeShares);
    const remainingCostBasis = Number(
      (remainingShares * avgEntryPrice).toFixed(6),
    );
    const updatedAvgEntryPrice =
      remainingShares > 0
        ? Number((remainingCostBasis / remainingShares).toFixed(6))
        : 0;
    const closedCostBasis = Number((closeShares * avgEntryPrice).toFixed(6));
    const tradeOutcome = this.calculateOutcome(realizedPnl);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (request.type === 'full') {
        await client.query(
          `
            DELETE FROM silver_dgterminal.positions
            WHERE user_id = $1::BIGINT
              AND asset = $2
          `,
          [userId, positionId],
        );
      } else {
        await client.query(
          `
            UPDATE silver_dgterminal.positions
            SET
              shares = $1::NUMERIC,
              cost_basis = $2::NUMERIC,
              avg_entry_price = $3::NUMERIC,
              last_updated = NOW(),
              updated_at = NOW()
            WHERE user_id = $4::BIGINT
              AND asset = $5
          `,
          [
            `${remainingShares}`,
            `${remainingCostBasis}`,
            `${updatedAvgEntryPrice}`,
            userId,
            positionId,
          ],
        );
      }

      await this.recordRealizedPnl(
        client,
        userId,
        existingPosition.proxy_wallet,
        realizedPnl,
      );
      await this.insertManualCloseTrade(
        client,
        userId,
        positionId,
        existingPosition,
        avgEntryPrice,
        closeShares,
        closedCostBasis,
        currentPrice,
        realizedPnl,
        closedAt,
        tradeOutcome,
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    if (request.type === 'full') {
      return {
        realized_pnl: realizedPnl,
        closed_at: closedAt,
      };
    }

    return {
      realized_pnl: realizedPnl,
      remaining_size: remainingShares,
      avg_entry_price: updatedAvgEntryPrice,
    };
  }

  private async fetchPosition(
    userId: string,
    positionId: string,
  ): Promise<{
    proxy_wallet: string;
    market_name: string | null;
    side: string | null;
    venue: string | null;
    category: string | null;
    shares: string | number | null;
    avg_entry_price: string | number | null;
    current_price: string | number | null;
  }> {
    const { rows } = await this.pool.query<{
      proxy_wallet: string;
      market_name: string | null;
      side: string | null;
      venue: string | null;
      category: string | null;
      shares: string | number | null;
      avg_entry_price: string | number | null;
      current_price: string | number | null;
    }>(
      `
        SELECT
          proxy_wallet,
          market_name,
          side,
          venue,
          category,
          shares,
          avg_entry_price,
          current_price
        FROM silver_dgterminal.positions
        WHERE user_id = $1::BIGINT
          AND asset = $2
        LIMIT 1
      `,
      [userId, positionId],
    );
    if (rows.length === 0) {
      throw new NotFoundException({
        code: 'POSITION_NOT_FOUND',
        message: 'Position not found',
      });
    }
    return rows[0];
  }

  private async recordRealizedPnl(
    client: PoolClient,
    userId: string,
    proxyWallet: string,
    realizedPnl: number,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO silver_dgterminal.portfolio_summary (
          user_id,
          proxy_wallet,
          realized_30d,
          realized_30d_last_updated
        )
        VALUES ($1::BIGINT, $2, $3::NUMERIC, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
          realized_30d = COALESCE(silver_dgterminal.portfolio_summary.realized_30d, 0) + $3::NUMERIC,
          realized_30d_last_updated = NOW(),
          updated_at = NOW()
      `,
      [userId, proxyWallet, `${realizedPnl}`],
    );
  }

  private async insertManualCloseTrade(
    client: PoolClient,
    userId: string,
    positionId: string,
    position: {
      proxy_wallet: string;
      market_name: string | null;
      side: string | null;
      venue: string | null;
      category: string | null;
    },
    avgEntryPrice: number,
    closeShares: number,
    closedCostBasis: number,
    currentPrice: number,
    realizedPnl: number,
    closedAt: string,
    outcome: 'WON' | 'LOST' | 'PUSHED',
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO silver_dgterminal.trade_history (
          user_id,
          proxy_wallet,
          trade_id,
          trade_time,
          market_name,
          side,
          venue,
          category,
          entry_price,
          exit_price,
          cost_basis,
          shares,
          outcome,
          realized_pnl,
          rewards_earned,
          is_settlement,
          is_manual_close
        )
        VALUES (
          $1::BIGINT,
          $2,
          $3,
          $4::TIMESTAMPTZ,
          $5,
          $6,
          COALESCE($7, 'Polymarket'),
          $8,
          $9::NUMERIC,
          $10::NUMERIC,
          $11::NUMERIC,
          $12::NUMERIC,
          $13,
          $14::NUMERIC,
          0,
          FALSE,
          TRUE
        )
      `,
      [
        userId,
        position.proxy_wallet,
        `manual-close-${positionId}-${Date.now()}`,
        closedAt,
        position.market_name ?? `Position ${positionId}`,
        position.side,
        position.venue,
        position.category,
        `${avgEntryPrice}`,
        `${currentPrice}`,
        `${closedCostBasis}`,
        `${closeShares}`,
        outcome,
        `${realizedPnl}`,
      ],
    );
  }

  private calculateOutcome(realizedPnl: number): 'WON' | 'LOST' | 'PUSHED' {
    if (realizedPnl > 0) {
      return 'WON';
    }
    if (realizedPnl < 0) {
      return 'LOST';
    }
    return 'PUSHED';
  }

  private async executeMarketSell(
    positionId: string,
    size: number,
  ): Promise<void> {
    if (!this.venueOrderUrl) {
      this.logger.warn(
        `VENUE_ORDER_URL not set; skipping venue call for asset=${positionId}`,
      );
      return;
    }

    try {
      const response = await fetch(this.venueOrderUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset: positionId,
          side: 'sell',
          orderType: 'market',
          size,
        }),
        signal: AbortSignal.timeout(this.venueTimeoutMs),
      });
      if (!response.ok) {
        throw new Error(`Venue order request failed: ${response.status}`);
      }
    } catch (error) {
      this.logger.error(
        `Venue sell failed for asset=${positionId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException({
        code: 'VENUE_ORDER_FAILED',
        message: 'Failed to execute market sell on venue',
      });
    }
  }
}
