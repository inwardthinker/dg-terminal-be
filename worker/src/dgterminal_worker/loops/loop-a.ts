import { WorkerDb } from '../db';
import { PolymarketDataApi } from '../polymarket';

export async function runLoopA(
  _db: WorkerDb,
  _api: PolymarketDataApi,
): Promise<void> {
  // Intentionally no-op: current pipeline scope persists only positions and trade_history.
}
