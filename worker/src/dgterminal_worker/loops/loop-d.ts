import { mapClosedPositionToUpsert } from '../mappers';
import { WorkerDb } from '../db';
import { PolymarketDataApi } from '../polymarket';

export async function runLoopD(
  db: WorkerDb,
  api: PolymarketDataApi,
): Promise<void> {
  const walletUsers = await db.getWalletUsers();
  for (const { wallet, userId } of walletUsers) {
    try {
      const raw = await api.getClosedPositions(wallet);
      const mapped = raw
        .map((row) => mapClosedPositionToUpsert(userId, wallet, row))
        .filter((row) => row.tradeId.length > 0);
      await db.upsertTradeHistory(mapped);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[loop-d] wallet failed', wallet, error);
    }
  }
}
