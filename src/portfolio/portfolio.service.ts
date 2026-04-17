import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import {
  BalanceSnapshot,
  BalanceSnapshotRow,
  HistoryPeriod,
} from './portfolio.types';

@Injectable()
export class PortfolioService implements OnModuleDestroy {
  private readonly logger = new Logger(PortfolioService.name);
  private readonly pool: Pool;

  constructor(private readonly configService: ConfigService) {
    const connectionString =
      this.configService.getOrThrow<string>('DATABASE_URL');

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
}
