import { mapOpenPositionToUpsert } from '../mappers';
import { WorkerDb } from '../db';
import { PolymarketDataApi } from '../polymarket';

export async function runLoopB(
  db: WorkerDb,
  api: PolymarketDataApi,
): Promise<void> {
  const intervalMs = 30_000;
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
      const raw = await api.getOpenPositions(wallet);
      const mapped = raw
        .map((row) => mapOpenPositionToUpsert(userId, wallet, row))
        .filter((row) => row.shares > 0);
      await db.upsertPositions(mapped);
      await db.deletePositionOrphans(
        wallet,
        mapped.map((row) => row.asset),
      );
      await db.upsertPortfolioSummaryExposure(userId, wallet);
      written += 1;
    } catch (error) {
      failures += 1;
      // eslint-disable-next-line no-console
      console.error('[loop-b] wallet failed', wallet, error);
    }
  }

  const elapsedMs = Date.now() - cycleStartedAt;
  // eslint-disable-next-line no-console
  console.log('[loop-b] cycle completed', {
    attempted: sortedWalletUsers.length,
    written,
    failures,
    elapsedMs,
    intervalTargetMs: intervalMs,
  });
  if (elapsedMs > intervalMs) {
    // eslint-disable-next-line no-console
    console.warn(
      `[loop-b] cycle took ${elapsedMs}ms (>${intervalMs}ms interval target)`,
    );
  }
}
