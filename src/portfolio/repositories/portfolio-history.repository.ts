import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/database.constants';
import {
  BalanceSnapshot,
  BalanceSnapshotRow,
} from '../types/portfolio-history.type';

@Injectable()
export class PortfolioHistoryRepository {
  private readonly logger = new Logger(PortfolioHistoryRepository.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByUserId(userId: string): Promise<BalanceSnapshot[]> {
    const query = `
      WITH raw AS (
        SELECT
          snapshot_date::date AS snapshot_date,
          balance_value
        FROM equity_snapshots_user
        WHERE user_id = $1::BIGINT
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
      ORDER BY s.date ASC
    `;

    try {
      const { rows } = await this.pool.query<BalanceSnapshotRow>(query, [
        userId,
      ]);

      return rows
        .filter((row) => row.balance_value !== null)
        .map((row) => ({
          date: row.date,
          balanceValue: Number(row.balance_value),
        }));
    } catch (error) {
      this.logger.error(
        `history query failed for userId=${userId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }
}
