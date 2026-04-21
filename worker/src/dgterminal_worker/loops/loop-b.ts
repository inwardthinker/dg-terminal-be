import { mapOpenPositionToUpsert } from '../mappers';
import { WorkerDb } from '../db';
import { PolymarketDataApi } from '../polymarket';

export async function runLoopB(
  db: WorkerDb,
  api: PolymarketDataApi,
): Promise<void> {
  const walletUsers = await db.getWalletUsers();
  for (const { wallet, userId } of walletUsers) {
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
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[loop-b] wallet failed', wallet, error);
    }
  }
}
