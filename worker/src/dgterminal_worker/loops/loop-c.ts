import { WorkerDb } from '../db';
import { PolymarketDataApi } from '../polymarket';
import { sumRewardsEarned30d } from '../rewards';

export async function runLoopC(
  db: WorkerDb,
  api: PolymarketDataApi,
): Promise<void> {
  const intervalMs = 60_000;
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
      const activityRows = await api.getActivity(wallet);
      const rewardsEarned = sumRewardsEarned30d(activityRows);
      await db.upsertPortfolioSummaryRewards(userId, wallet, rewardsEarned);
      written += 1;
    } catch (error) {
      failures += 1;
      // eslint-disable-next-line no-console
      console.error('[loop-c] wallet failed', { userId, wallet, error });
    }
  }

  const elapsedMs = Date.now() - cycleStartedAt;
  // eslint-disable-next-line no-console
  console.log('[loop-c] cycle completed', {
    attempted: sortedWalletUsers.length,
    written,
    failures,
    elapsedMs,
    intervalTargetMs: intervalMs,
  });
  if (elapsedMs > intervalMs) {
    // eslint-disable-next-line no-console
    console.warn(
      `[loop-c] cycle took ${elapsedMs}ms (>${intervalMs}ms interval target)`,
    );
  }
}
