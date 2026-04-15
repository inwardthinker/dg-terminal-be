import { PortfolioPosition } from '../../portfolio/types/portfolio-position.type';
import { PolymarketRawPosition } from '../types/polymarket-position.type';

function parseOptionalNumber(value: string | undefined): number {
  if (value === undefined || value === '') {
    return 0;
  }
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function parseOptionalInt(value: string | undefined): number {
  if (value === undefined || value === '') {
    return 0;
  }
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

function parseOptionalBool(raw: string | undefined): boolean {
  if (raw === undefined || raw === '') {
    return false;
  }
  const lower = raw.toLowerCase();
  return lower === 'true' || lower === '1';
}

export function mapPolymarketPosition(
  raw: PolymarketRawPosition,
): PortfolioPosition {
  const shares = Number.parseFloat(raw.size);
  const avgEntryPrice = Number.parseFloat(raw.avg_price);
  const currentPrice = Number.parseFloat(raw.cur_price);

  const normalizedShares = Number.isFinite(shares) ? shares : 0;
  const normalizedAvgEntryPrice = Number.isFinite(avgEntryPrice)
    ? avgEntryPrice
    : 0;
  const normalizedCurrentPrice = Number.isFinite(currentPrice)
    ? currentPrice
    : 0;

  const hasDataApiMetrics =
    raw.initial_value !== undefined &&
    raw.initial_value !== '' &&
    raw.current_value !== undefined &&
    raw.current_value !== '';

  let costBasis: number;
  let exposure: number;
  let unrealizedPnl: number;
  let unrealizedPnlPct: number;

  if (hasDataApiMetrics) {
    costBasis = Number.parseFloat(raw.initial_value!);
    exposure = Number.parseFloat(raw.current_value!);
    unrealizedPnl =
      raw.cash_pnl !== undefined && raw.cash_pnl !== ''
        ? Number.parseFloat(raw.cash_pnl)
        : exposure - costBasis;
    unrealizedPnlPct = costBasis !== 0 ? unrealizedPnl / costBasis : 0;
  } else {
    costBasis = normalizedShares * normalizedAvgEntryPrice;
    exposure = normalizedShares * normalizedCurrentPrice;
    unrealizedPnl = exposure - costBasis;
    unrealizedPnlPct = costBasis !== 0 ? unrealizedPnl / costBasis : 0;
  }

  const initialValueNum = hasDataApiMetrics
    ? Number.parseFloat(raw.initial_value!)
    : costBasis;
  const currentValueNum = hasDataApiMetrics
    ? Number.parseFloat(raw.current_value!)
    : exposure;

  const totalBought = parseOptionalNumber(raw.total_bought);
  const totalBoughtOut = totalBought > 0 ? totalBought : normalizedShares;

  return {
    market_name: raw.market,
    category: raw.category || 'Unknown',
    venue: 'Polymarket',
    side: raw.side,
    avg_entry_price: normalizedAvgEntryPrice,
    current_price: normalizedCurrentPrice,
    shares: normalizedShares,
    cost_basis: costBasis,
    unrealized_pnl: unrealizedPnl,
    unrealized_pnl_pct: unrealizedPnlPct,
    exposure,
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
    end_date: raw.end_date ?? '',
    redeemable: parseOptionalBool(raw.redeemable),
    mergeable: parseOptionalBool(raw.mergeable),
    negative_risk: parseOptionalBool(raw.negative_risk),
    total_bought: totalBoughtOut,
    realized_pnl: parseOptionalNumber(raw.realized_pnl),
    percent_realized_pnl: parseOptionalNumber(raw.percent_realized_pnl),
    initial_value: Number.isFinite(initialValueNum) ? initialValueNum : 0,
    current_value: Number.isFinite(currentValueNum) ? currentValueNum : 0,
    percent_pnl: parseOptionalNumber(raw.percent_pnl),
  };
}
