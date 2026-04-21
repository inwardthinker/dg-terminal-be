import { mapClosedPositionToUpsert } from '../mappers';
import { WorkerDb } from '../db';
import { PolymarketDataApi } from '../polymarket';

export async function runLoopD(
  db: WorkerDb,
  api: PolymarketDataApi,
): Promise<void> {
  const intervalMs = 300_000;
  const cycleStartedAt = Date.now();
  const walletUsers = await db.getWalletUsers();
  const sortedWalletUsers = [...walletUsers].sort((a, b) => {
    if (a.userId !== b.userId) return a.userId - b.userId;
    return a.wallet.localeCompare(b.wallet);
  });

  let written = 0;
  let failures = 0;

  for (const { wallet, userId } of sortedWalletUsers) {
    try {
      const raw = await api.getClosedPositions(wallet);
      const mapped = raw
        .map((row) => mapClosedPositionToUpsert(userId, wallet, row))
        .filter((row) => row.tradeId.length > 0);
      await db.upsertTradeHistory(mapped);
      await db.upsertPortfolioSummaryRealized30d(userId, wallet);
      written += 1;
    } catch (error) {
      failures += 1;
      // eslint-disable-next-line no-console
      console.error('[loop-d] wallet failed', wallet, error);
    }
  }

  const elapsedMs = Date.now() - cycleStartedAt;
  // eslint-disable-next-line no-console
  console.log('[loop-d] cycle completed', {
    attempted: sortedWalletUsers.length,
    written,
    failures,
    elapsedMs,
    intervalTargetMs: intervalMs,
  });
  if (elapsedMs > intervalMs) {
    // eslint-disable-next-line no-console
    console.warn(
      `[loop-d] cycle took ${elapsedMs}ms (>${intervalMs}ms interval target)`,
    );
  }
}
