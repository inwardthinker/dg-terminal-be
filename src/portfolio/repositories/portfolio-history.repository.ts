import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/database.constants';
import {
  BalanceSnapshot,
  BalanceSnapshotRow,
  HistoryPeriod,
} from '../types/portfolio-history.type';

@Injectable()
export class PortfolioHistoryRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByUserId(
    userId: string,
    period: HistoryPeriod,
  ): Promise<BalanceSnapshot[]> {
    const query = `
      WITH latest AS (
        SELECT MAX(snapshot_date) AS max_date
        FROM equity_snapshots_user
        WHERE user_id = $1::BIGINT
      ),
      raw AS (
        SELECT
          snapshot_date::date AS snapshot_date,
          balance_value
        FROM equity_snapshots_user
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
      ORDER BY s.date ASC
    `;

    const { rows } = await this.pool.query<BalanceSnapshotRow>(query, [
      userId,
      period,
    ]);

    const snapshots = rows
      .filter((row) => row.balance_value !== null)
      .map((row) => ({
        date: row.date,
        balance_value: Number(row.balance_value),
      }));

    if (snapshots.length < 3) {
      return [];
    }

    return snapshots;
  }
}
