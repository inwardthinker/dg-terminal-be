import { ActivityRow } from './polymarket';

const REWARD_TYPES = new Set([
  'REWARD',
  'REBATE',
  'MAKER_REBATE',
  'VOLUME_BONUS',
]);

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function sumRewardsEarned30d(
  rows: ActivityRow[],
  now: Date = new Date(),
): number {
  const cutoffMs = now.getTime() - THIRTY_DAYS_MS;
  let total = 0;

  for (const row of rows) {
    const type = toUpperString(row.type);
    if (!REWARD_TYPES.has(type)) continue;

    const tsMs = toTimestampMs(row);
    if (tsMs === null || tsMs <= cutoffMs) continue;

    total += toFiniteNumber(row.amount);
  }

  return total;
}

function toUpperString(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().toUpperCase();
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toTimestampMs(row: ActivityRow): number | null {
  const raw =
    row.timestamp ?? row.ts ?? row.createdAt ?? row.created_at ?? row.time;

  if (raw instanceof Date) {
    return Number.isFinite(raw.getTime()) ? raw.getTime() : null;
  }

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    // Heuristic: values below 1e12 are likely seconds.
    return raw < 1_000_000_000_000 ? raw * 1000 : raw;
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      const asNum = Number.parseFloat(trimmed);
      if (!Number.isFinite(asNum)) return null;
      return asNum < 1_000_000_000_000 ? asNum * 1000 : asNum;
    }
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
