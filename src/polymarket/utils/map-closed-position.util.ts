import { PortfolioClosedPosition } from '../../portfolio/types/portfolio-closed-position.type';
import { PolymarketRawClosedPosition } from '../types/polymarket-closed-position.type';

function parseOptionalInt(value: string | undefined): number {
  if (value === undefined || value === '') {
    return 0;
  }
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

export function mapPolymarketClosedPosition(
  raw: PolymarketRawClosedPosition,
): PortfolioClosedPosition {
  const shares = Number.parseFloat(raw.size);
  const avgEntryPrice = Number.parseFloat(raw.avg_price);
  const currentPrice = Number.parseFloat(raw.cur_price);
  const realizedPnl = Number.parseFloat(raw.realized_pnl);

  const normalizedShares = Number.isFinite(shares) ? shares : 0;
  const normalizedAvgEntryPrice = Number.isFinite(avgEntryPrice)
    ? avgEntryPrice
    : 0;
  const normalizedCurrentPrice = Number.isFinite(currentPrice)
    ? currentPrice
    : 0;
  const normalizedRealizedPnl = Number.isFinite(realizedPnl) ? realizedPnl : 0;

  const costBasis = normalizedShares * normalizedAvgEntryPrice;
  const realizedPnlPct =
    costBasis !== 0 ? normalizedRealizedPnl / costBasis : 0;

  const ts = raw.timestamp;
  const closedAt =
    Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : '';

  return {
    market_name: raw.market,
    category: raw.category || 'Unknown',
    venue: 'Polymarket',
    side: raw.side,
    avg_entry_price: normalizedAvgEntryPrice,
    current_price: normalizedCurrentPrice,
    shares: normalizedShares,
    cost_basis: costBasis,
    realized_pnl: normalizedRealizedPnl,
    realized_pnl_pct: realizedPnlPct,
    end_date: raw.end_date,
    closed_at: closedAt,
    condition_id: raw.condition_id,
    outcome_token_id: raw.outcome_token_id ?? '',
    proxy_wallet: raw.proxy_wallet ?? '',
    slug: raw.slug ?? '',
    icon: raw.icon ?? '',
    event_id: raw.event_id ?? '',
    event_slug: raw.event_slug ?? '',
    outcome_index: parseOptionalInt(raw.outcome_index),
    opposite_outcome: raw.opposite_outcome ?? '',
    opposite_asset: raw.opposite_asset ?? '',
  };
}
