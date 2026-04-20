import WebSocket from 'ws';
import { WorkerConfig } from '../config';
import { WorkerDb } from '../db';

type PriceEvent = {
  proxy_wallet?: string;
  asset?: string;
  price?: number | string;
};

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export function startWsLoop(
  config: WorkerConfig,
  db: WorkerDb,
): { close: () => void } {
  let ws: WebSocket;
  let stopped = false;
  let attempt = 0;

  function connect(): void {
    ws = new WebSocket(config.polymarket.clobWsUrl);

    ws.on('open', () => {
      attempt = 0;
      // eslint-disable-next-line no-console
      console.log('[loop-ws] connected');
    });

    ws.on('message', async (raw) => {
      try {
        const payload = JSON.parse(raw.toString()) as PriceEvent;
        if (
          !payload.proxy_wallet ||
          !payload.asset ||
          payload.price === undefined
        ) {
          return;
        }
        const currentPrice =
          typeof payload.price === 'number'
            ? payload.price
            : Number.parseFloat(payload.price);
        if (!Number.isFinite(currentPrice)) return;

        const positionResult = await db.pool.query<{
          shares: string;
          avg_entry_price: string;
        }>(
          `
          SELECT shares::text, avg_entry_price::text
        FROM positions
          WHERE proxy_wallet = $1 AND asset = $2
          `,
          [payload.proxy_wallet, payload.asset],
        );
        if (positionResult.rowCount === 0) return;
        const row = positionResult.rows[0];
        if (!row) return;
        const shares = Number.parseFloat(row.shares ?? '0');
        const avg = Number.parseFloat(row.avg_entry_price ?? '0');
        const costBasis = shares * avg;
        const currentValue = shares * currentPrice;
        const pnl = currentValue - costBasis;
        const pnlPct = costBasis > 0 ? pnl / costBasis : 0;
        await db.updatePositionPricePatch(
          payload.proxy_wallet,
          payload.asset,
          currentPrice,
          pnl,
          pnlPct,
        );
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[loop-ws] message failed', error);
      }
    });

    ws.on('error', (error) => {
      // eslint-disable-next-line no-console
      console.error('[loop-ws] error', error);
    });

    ws.on('close', () => {
      if (stopped) return;
      attempt += 1;
      const delay = Math.min(
        RECONNECT_BASE_MS * 2 ** (attempt - 1),
        RECONNECT_MAX_MS,
      );
      // eslint-disable-next-line no-console
      console.warn(
        `[loop-ws] disconnected — reconnecting in ${delay}ms (attempt ${attempt})`,
      );
      setTimeout(connect, delay);
    });
  }

  connect();

  return {
    close: () => {
      stopped = true;
      ws.close();
    },
  };
}
