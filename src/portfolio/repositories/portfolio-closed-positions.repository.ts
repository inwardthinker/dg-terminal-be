import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/database.constants';
import { GetPortfolioClosedPositionsQueryDto } from '../dto/get-portfolio-closed-positions.query.dto';
import { PortfolioClosedPosition } from '../types/portfolio-closed-position.type';
import { CLOSED_SORTABLE_FIELDS } from '../types/sortable-closed-field.type';

const SORTABLE_FIELD_SET = new Set<string>(CLOSED_SORTABLE_FIELDS);
const CLOSED_SORT_SQL_MAP: Record<string, string> = {
  market_name: 'market_name',
  category: 'category',
  venue: 'venue',
  side: 'side',
  avg_entry_price: 'entry_price',
  current_price: 'exit_price',
  shares: 'shares',
  cost_basis: 'cost_basis',
  realized_pnl: 'realized_pnl',
  realized_pnl_pct:
    'CASE WHEN COALESCE(cost_basis, 0) = 0 THEN 0 ELSE realized_pnl / cost_basis END',
  end_date: 'trade_time',
  closed_at: 'trade_time',
  condition_id: 'condition_id',
  outcome_token_id: 'asset',
  safe_wallet_address: 'safe_wallet_address',
  slug: 'slug',
  icon: 'icon',
  event_id: 'event_id',
  event_slug: 'event_slug',
  outcome_index: 'outcome_index',
  opposite_outcome: 'opposite_outcome',
  opposite_asset: 'opposite_asset',
};

@Injectable()
export class PortfolioClosedPositionsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByWallet(
    query: GetPortfolioClosedPositionsQueryDto,
  ): Promise<PortfolioClosedPosition[]> {
    const values: unknown[] = [
      query.wallet,
      query.limit ?? 30,
      query.offset ?? 0,
    ];
    const whereClause = 'WHERE safe_wallet_address = $1';

    if (!query.sort_by) {
      const sql = `
        WITH category_pnl AS (
          SELECT category, SUM(COALESCE(realized_pnl, 0)) AS total_realized_pnl
          FROM trade_history
          ${whereClause}
          GROUP BY category
        )
        SELECT t.*
        FROM trade_history t
        LEFT JOIN category_pnl cp ON cp.category = t.category
        ${whereClause.replace('safe_wallet_address', 't.safe_wallet_address')}
        ORDER BY COALESCE(cp.total_realized_pnl, 0) DESC, COALESCE(t.realized_pnl, 0) DESC
        LIMIT $2 OFFSET $3
      `;
      const result = await this.pool.query(sql, values);
      return result.rows.map(mapClosedRow);
    }

    if (!SORTABLE_FIELD_SET.has(query.sort_by)) {
      return [];
    }

    const sortDirection =
      (query.sort_dir ?? 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const sortExpression = CLOSED_SORT_SQL_MAP[query.sort_by];
    if (!sortExpression) {
      return [];
    }
    const sql = `
      SELECT *
      FROM trade_history
      ${whereClause}
      ORDER BY ${sortExpression} ${sortDirection}
      LIMIT $2 OFFSET $3
    `;
    const result = await this.pool.query(sql, values);
    return result.rows.map(mapClosedRow);
  }
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim())
    return Number.parseFloat(value);
  return 0;
}

function toString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return '';
}

function mapClosedRow(row: Record<string, unknown>): PortfolioClosedPosition {
  const costBasis = toNumber(row.cost_basis);
  const realizedPnl = toNumber(row.realized_pnl);
  return {
    market_name: toString(row.market_name),
    category: toString(row.category || 'Other'),
    venue: toString(row.venue || 'Polymarket'),
    side: toString(row.side),
    avg_entry_price: toNumber(row.entry_price || row.avg_entry_price),
    current_price: toNumber(row.exit_price || row.current_price),
    shares: toNumber(row.shares),
    cost_basis: costBasis,
    realized_pnl: realizedPnl,
    realized_pnl_pct: costBasis > 0 ? realizedPnl / costBasis : 0,
    end_date: row.trade_time
      ? new Date(toString(row.trade_time)).toISOString()
      : '',
    closed_at: row.trade_time
      ? new Date(toString(row.trade_time)).toISOString()
      : '',
    condition_id: toString(row.condition_id),
    outcome_token_id: toString(row.asset),
    safe_wallet_address: toString(row.safe_wallet_address),
    slug: toString(row.slug),
    icon: toString(row.icon),
    event_id: toString(row.event_id),
    event_slug: toString(row.event_slug),
    outcome_index: toNumber(row.outcome_index),
    opposite_outcome: toString(row.opposite_outcome),
    opposite_asset: toString(row.opposite_asset),
  };
}
