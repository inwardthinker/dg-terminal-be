import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/database.constants';
import { GetPortfolioPositionsQueryDto } from '../dto/get-portfolio-positions.query.dto';
import { PortfolioPosition } from '../types/portfolio-position.type';
import { SORTABLE_FIELDS } from '../types/sortable-field.type';

const SORTABLE_FIELD_SET = new Set<string>(SORTABLE_FIELDS);
const POSITION_SORT_COLUMN_MAP: Record<string, string> = {
  market_name: 'market_name',
  category: 'category',
  venue: 'venue',
  side: 'side',
  avg_entry_price: 'avg_entry_price',
  current_price: 'current_price',
  shares: 'shares',
  cost_basis: 'cost_basis',
  unrealized_pnl: 'unrealized_pnl',
  unrealized_pnl_pct: 'unrealized_pnl_pct',
  exposure: 'current_value',
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
  end_date: 'end_date',
  redeemable: 'redeemable',
  mergeable: 'mergeable',
  negative_risk: 'negative_risk',
  total_bought: 'total_bought',
  realized_pnl: 'realized_pnl',
  percent_realized_pnl: 'percent_realized_pnl',
  initial_value: 'initial_value',
  current_value: 'current_value',
  percent_pnl: 'percent_pnl',
};

@Injectable()
export class PortfolioPositionsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByWallet(
    query: GetPortfolioPositionsQueryDto,
  ): Promise<PortfolioPosition[]> {
    const values: unknown[] = [query.wallet];
    const whereClause = 'WHERE safe_wallet_address = $1';

    if (!query.sort_by) {
      const sql = `
        WITH category_exposure AS (
          SELECT
            category,
            SUM(COALESCE(cost_basis, 0)) AS total_exposure
          FROM positions
          ${whereClause}
          GROUP BY category
        )
        SELECT p.*
        FROM positions p
        LEFT JOIN category_exposure ce ON ce.category = p.category
        ${whereClause.replace('safe_wallet_address', 'p.safe_wallet_address')}
        ORDER BY COALESCE(ce.total_exposure, 0) DESC, COALESCE(p.cost_basis, 0) DESC
      `;
      const result = await this.pool.query(sql, values);
      return result.rows.map(mapPositionRow);
    }

    if (!SORTABLE_FIELD_SET.has(query.sort_by)) {
      return [];
    }

    const sortDirection =
      (query.sort_dir ?? 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const sortColumn = POSITION_SORT_COLUMN_MAP[query.sort_by];
    if (!sortColumn) {
      return [];
    }
    const sql = `
      SELECT *
      FROM positions
      ${whereClause}
      ORDER BY ${sortColumn} ${sortDirection}
    `;
    const result = await this.pool.query(sql, values);
    return result.rows.map(mapPositionRow);
  }
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim())
    return Number.parseFloat(value);
  return 0;
}

function toBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
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

function mapPositionRow(row: Record<string, unknown>): PortfolioPosition {
  return {
    market_name: toString(row.market_name),
    category: toString(row.category || 'Other'),
    venue: toString(row.venue || 'Polymarket'),
    side: toString(row.side),
    avg_entry_price: toNumber(row.avg_entry_price),
    current_price: toNumber(row.current_price),
    shares: toNumber(row.shares),
    cost_basis: toNumber(row.cost_basis),
    unrealized_pnl: toNumber(row.unrealized_pnl),
    unrealized_pnl_pct: toNumber(row.unrealized_pnl_pct),
    exposure: toNumber(row.current_value || row.cost_basis),
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
    end_date: row.end_date
      ? new Date(toString(row.end_date)).toISOString()
      : '',
    redeemable: toBoolean(row.redeemable),
    mergeable: toBoolean(row.mergeable),
    negative_risk: toBoolean(row.negative_risk),
    total_bought: toNumber(row.total_bought),
    realized_pnl: toNumber(row.realized_pnl),
    percent_realized_pnl: toNumber(row.percent_realized_pnl),
    initial_value: toNumber(row.initial_value),
    current_value: toNumber(row.current_value),
    percent_pnl: toNumber(row.percent_pnl),
  };
}
