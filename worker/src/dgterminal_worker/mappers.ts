import { PositionUpsertRow, TradeHistoryUpsertRow } from './db';

const toNum = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim())
    return Number.parseFloat(value);
  return 0;
};

const toStr = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value);
};

const toBool = (value: unknown): boolean =>
  value === true || value === 'true' || value === 1 || value === '1';

const toSide = (value: unknown): 'YES' | 'NO' =>
  toStr(value).toUpperCase() === 'NO' ? 'NO' : 'YES';

export function mapOpenPositionToUpsert(
  userId: number,
  wallet: string,
  row: Record<string, unknown>,
): PositionUpsertRow {
  const shares = toNum(row.size ?? row.shares);
  const avgEntryPrice = toNum(
    row.avgPrice ?? row.avg_price ?? row.avg_entry_price,
  );
  const currentPrice = toNum(
    row.curPrice ?? row.cur_price ?? row.current_price ?? row.currentPrice,
  );
  const costBasis =
    toNum(row.initialValue ?? row.initial_value) || shares * avgEntryPrice;
  const currentValue =
    toNum(row.currentValue ?? row.current_value) || shares * currentPrice;
  const unrealizedPnl =
    toNum(row.cashPnl ?? row.cash_pnl) || currentValue - costBasis;
  const unrealizedPnlPct =
    toNum(row.percentPnl ?? row.percent_pnl) ||
    (costBasis > 0 ? unrealizedPnl / costBasis : 0);

  return {
    userId,
    safeWalletAddress: wallet,
    asset: toStr(row.asset),
    conditionId: toStr(row.conditionId ?? row.condition_id),
    marketName: toStr(
      row.title ?? row.market ?? row.question ?? 'Unknown Market',
    ),
    category: toStr(row.category ?? row.group ?? 'Other') || 'Other',
    side: toSide(row.side ?? row.outcome ?? row.outcomeName),
    icon: toStr(row.icon),
    endDate:
      row.endDate || row.end_date
        ? new Date(toStr(row.endDate ?? row.end_date))
        : null,
    redeemable: toBool(row.redeemable),
    shares,
    avgEntryPrice,
    costBasis,
    currentPrice,
    unrealizedPnl,
    unrealizedPnlPct,
    slug: toStr(row.slug),
    eventId: toStr(row.eventId ?? row.event_id),
    eventSlug: toStr(row.eventSlug ?? row.event_slug),
    outcomeIndex: Math.trunc(toNum(row.outcomeIndex ?? row.outcome_index)),
    oppositeOutcome: toStr(row.oppositeOutcome ?? row.opposite_outcome),
    oppositeAsset: toStr(row.oppositeAsset ?? row.opposite_asset),
    mergeable: toBool(row.mergeable),
    negativeRisk: toBool(row.negativeRisk ?? row.negative_risk),
    totalBought: toNum(row.totalBought ?? row.total_bought),
    realizedPnl: toNum(row.realizedPnl ?? row.realized_pnl),
    percentRealizedPnl: toNum(
      row.percentRealizedPnl ?? row.percent_realized_pnl,
    ),
    initialValue: toNum(row.initialValue ?? row.initial_value),
    currentValue,
    percentPnl: toNum(row.percentPnl ?? row.percent_pnl),
  };
}

export function mapClosedPositionToUpsert(
  userId: number,
  wallet: string,
  row: Record<string, unknown>,
): TradeHistoryUpsertRow {
  const shares = toNum(row.size ?? row.totalBought ?? row.total_bought);
  const entryPrice = toNum(row.avgPrice ?? row.avg_price);
  const exitPrice = toNum(row.curPrice ?? row.cur_price);
  const costBasis = toNum(row.cost_basis) || shares * entryPrice;
  const realizedPnl = toNum(row.realizedPnl ?? row.realized_pnl);
  const status = toStr(row.status).toLowerCase();
  const outcome: 'WON' | 'LOST' | 'PUSHED' =
    status === 'won' ? 'WON' : status === 'lost' ? 'LOST' : 'PUSHED';
  const ts = Number.parseInt(toStr(row.timestamp), 10);

  const tradeId = resolveTradeId(row, wallet);

  return {
    userId,
    safeWalletAddress: wallet,
    tradeId,
    tradeTime: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000) : new Date(),
    marketName: toStr(
      row.title ?? row.market ?? row.question ?? 'Unknown Market',
    ),
    side: toSide(row.side ?? row.outcome ?? row.outcomeName),
    category: toStr(row.category ?? row.group ?? 'Other') || 'Other',
    entryPrice,
    exitPrice,
    costBasis,
    shares,
    outcome,
    realizedPnl,
    rewardsEarned: 0,
    isSettlement: status === 'settled',
    isManualClose: status === 'closed',
    asset: toStr(row.asset),
    conditionId: toStr(row.conditionId ?? row.condition_id),
    slug: toStr(row.slug),
    icon: toStr(row.icon),
    eventId: toStr(row.eventId ?? row.event_id),
    eventSlug: toStr(row.eventSlug ?? row.event_slug),
    outcomeIndex: Math.trunc(toNum(row.outcomeIndex ?? row.outcome_index)),
    oppositeOutcome: toStr(row.oppositeOutcome ?? row.opposite_outcome),
    oppositeAsset: toStr(row.oppositeAsset ?? row.opposite_asset),
  };
}

function resolveTradeId(row: Record<string, unknown>, wallet: string): string {
  const direct = toStr(
    row.id ?? row.trade_id ?? row.positionId ?? row.position_id,
  );
  if (direct) return direct;

  // Polymarket closed-positions rows often omit explicit trade IDs.
  // Build a deterministic key from stable fields so upsert behavior remains idempotent.
  const conditionId = toStr(row.conditionId ?? row.condition_id);
  const asset = toStr(row.asset);
  const outcome = toStr(row.outcome ?? row.side ?? row.outcomeName);
  const timestamp = toStr(row.timestamp);
  const totalBought = toStr(row.totalBought ?? row.total_bought ?? row.size);
  const avgPrice = toStr(row.avgPrice ?? row.avg_price);
  const realizedPnl = toStr(row.realizedPnl ?? row.realized_pnl);
  return [
    wallet,
    conditionId,
    asset,
    outcome,
    timestamp,
    totalBought,
    avgPrice,
    realizedPnl,
  ].join(':');
}
