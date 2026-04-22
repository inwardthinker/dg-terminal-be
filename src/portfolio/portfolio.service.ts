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
  PortfolioKpis,
  PortfolioKpisRow,
} from './portfolio.types';

@Injectable()
export class PortfolioService implements OnModuleDestroy {
  private readonly logger = new Logger(PortfolioService.name);
  private readonly pool: Pool;
  private readonly venueOrderUrl?: string;
  private readonly venueTimeoutMs: number;
  private readonly polymarketDataApiUrl: string;
  private readonly polymarketDataApiAuthHeaderName: string;
  private readonly polymarketDataApiAuthHeaderValue: string;

  constructor(private readonly configService: ConfigService) {
    const connectionString = this.buildConnectionString();
    this.venueOrderUrl = this.configService.get<string>('VENUE_ORDER_URL');
    this.venueTimeoutMs = Number(
      this.configService.get<string>('VENUE_ORDER_TIMEOUT_MS') ?? '1500',
    );
    this.polymarketDataApiUrl = this.configService.get<string>(
      'POLYMARKET_DATA_API_URL',
      'https://data-api.polymarket.com',
    );
    this.polymarketDataApiAuthHeaderName = this.configService.get<string>(
      'POLYMARKET_DATA_API_AUTH_HEADER_NAME',
      '',
    );
    this.polymarketDataApiAuthHeaderValue = this.configService.get<string>(
      'POLYMARKET_DATA_API_AUTH_HEADER_VALUE',
      '',
    );

    this.pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });
  }

  private buildConnectionString(): string {
    const dbHost = this.configService.get<string>('db_hostname');
    const dbName = this.configService.get<string>('db_name');
    const dbUser = this.configService.get<string>('db_username');
    const dbPassword = this.configService.get<string>('db_password');
    const dbPort = this.configService.get<string>('db_port');

    if (dbHost && dbName && dbUser && dbPassword && dbPort) {
      const encodedUser = encodeURIComponent(dbUser);
      const encodedPassword = encodeURIComponent(dbPassword);
      return `postgresql://${encodedUser}:${encodedPassword}@${dbHost}:${dbPort}/${dbName}`;
    }

    return this.configService.getOrThrow<string>('DATABASE_URL');
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

  async getKpis(wallet: string): Promise<PortfolioKpis> {
    const normalizedWallet = wallet.toLowerCase();
    const [rows, openExposureFromApi, unrealizedPnlFromApi] = await Promise.all(
      [
        this.queryPortfolioSummaryByWallet(normalizedWallet),
        this.fetchOpenExposureFromPolymarket(wallet),
        this.fetchUnrealizedPnlFromPolymarket(wallet),
      ],
    );

    const row = rows[0];
    const cashBalance = row ? toNumber(row.balance) : 0;
    const openExposure =
      typeof openExposureFromApi === 'number'
        ? openExposureFromApi
        : row
          ? toNumber(row.open_exposure)
          : 0;
    const unresolvedUnrealizedPnl =
      typeof unrealizedPnlFromApi === 'number'
        ? unrealizedPnlFromApi
        : row
          ? toNumber(row.unrealized_pnl)
          : 0;

    return {
      balance: cashBalance,
      open_exposure: openExposure,
      unrealized_pnl: unresolvedUnrealizedPnl,
      realized_30d: row ? toNumber(row.realized_30d) : 0,
      rewards_earned: row ? toNumber(row.rewards_earned) : 0,
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

  private async queryFallbackPortfolioSummary(
    normalizedWallet: string,
  ): Promise<PortfolioKpisRow[]> {
    const walletColumns = ['proxy_wallet', 'wallet', 'address'];
    for (const walletColumn of walletColumns) {
      try {
        const result = await this.pool.query<PortfolioKpisRow>(
          `
            SELECT
              balance,
              open_exposure,
              unrealized_pnl,
              realized_30d,
              rewards_earned
            FROM portfolio_summary
            WHERE LOWER(${walletColumn}) = $1
            ORDER BY updated_at DESC
            LIMIT 1
          `,
          [normalizedWallet],
        );
        return result.rows;
      } catch (error) {
        if (!isMissingColumnError(error)) {
          throw error;
        }
      }
    }

    const result = await this.pool.query<PortfolioKpisRow>(
      `
        SELECT
          balance,
          open_exposure,
          unrealized_pnl,
          realized_30d,
          rewards_earned
        FROM portfolio_summary
        ORDER BY updated_at DESC
        LIMIT 1
      `,
    );
    return result.rows;
  }

  private async queryPortfolioSummaryByWallet(
    normalizedWallet: string,
  ): Promise<PortfolioKpisRow[]> {
    try {
      const result = await this.pool.query<PortfolioKpisRow>(
        `
          SELECT
            balance,
            open_exposure,
            unrealized_pnl,
            realized_30d,
            rewards_earned
          FROM silver_dgterminal.portfolio_summary
          WHERE LOWER(proxy_wallet) = $1
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        [normalizedWallet],
      );
      return result.rows;
    } catch (error) {
      if (!isMissingRelationError(error)) {
        throw error;
      }
      return this.queryFallbackPortfolioSummary(normalizedWallet);
    }
  }

  private async fetchOpenExposureFromPolymarket(
    wallet: string,
  ): Promise<number | null> {
    try {
      const params = new URLSearchParams({ user: wallet });
      const response = await fetch(
        `${this.polymarketDataApiUrl}/value?${params.toString()}`,
        {
          headers: this.buildPolymarketDataApiHeaders(),
          signal: AbortSignal.timeout(2000),
        },
      );
      if (!response.ok) {
        return null;
      }
      const payload = (await response.json()) as Array<{
        user?: unknown;
        value?: unknown;
      }>;
      if (!Array.isArray(payload) || payload.length === 0) {
        return null;
      }
      const row = payload[0];
      if (typeof row?.value !== 'number') {
        return null;
      }
      return row.value;
    } catch {
      return null;
    }
  }

  private async fetchUnrealizedPnlFromPolymarket(
    wallet: string,
  ): Promise<number | null> {
    try {
      const params = new URLSearchParams({
        user: wallet,
        sizeThreshold: '0',
        limit: '500',
      });
      const response = await fetch(
        `${this.polymarketDataApiUrl}/positions?${params.toString()}`,
        {
          headers: this.buildPolymarketDataApiHeaders(),
          signal: AbortSignal.timeout(3000),
        },
      );
      if (!response.ok) {
        return null;
      }
      const payload = (await response.json()) as Array<{
        cashPnl?: unknown;
        percentPnl?: unknown;
        size?: unknown;
      }>;
      if (!Array.isArray(payload)) {
        return null;
      }

      let unrealized = 0;
      for (const position of payload) {
        const shares = toFiniteNumber(position.size);
        if (shares <= 0) {
          continue;
        }
        const percentPnl = toFiniteNumber(position.percentPnl);
        // Exclude effectively lost rows (<= -99%).
        if (percentPnl <= -99) {
          continue;
        }
        unrealized += toFiniteNumber(position.cashPnl);
      }
      return unrealized;
    } catch {
      return null;
    }
  }

  private buildPolymarketDataApiHeaders(): Record<string, string> | undefined {
    if (
      !this.polymarketDataApiAuthHeaderName ||
      !this.polymarketDataApiAuthHeaderValue
    ) {
      return undefined;
    }
    return {
      [this.polymarketDataApiAuthHeaderName]:
        this.polymarketDataApiAuthHeaderValue,
    };
  }
}

function toNumber(value: string | number | null): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    return Number.parseFloat(value);
  }
  return 0;
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  return (error as { code?: string }).code === '42P01';
}

function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  return (error as { code?: string }).code === '42703';
}
