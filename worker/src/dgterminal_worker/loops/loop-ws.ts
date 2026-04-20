import WebSocket from 'ws';
import { WorkerConfig } from '../config';
import { WorkerDb } from '../db';

type MarketEvent = {
  event_type?: string;
  asset_id?: string;
  price?: number | string;
  best_bid?: number | string;
  best_ask?: number | string;
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
  let pingTimer: NodeJS.Timeout | null = null;
  let subscribedAssetIds = new Set<string>();

  function connect(): void {
    ws = new WebSocket(config.polymarket.clobWsUrl);

    ws.on('open', () => {
      // eslint-disable-next-line no-console
      console.log('[loop-ws] connected');
      void sendInitialSubscription();
      startHeartbeat();
    });

    ws.on('message', async (raw) => {
      try {
        if (raw.toString() === 'PONG') return;
        const payload = JSON.parse(raw.toString()) as MarketEvent;
        const assetId = payload.asset_id;
        if (!assetId) return;

        const currentPrice = resolvePrice(payload);
        if (!Number.isFinite(currentPrice)) return;

        // We only reset reconnect attempt after receiving valid price events.
        attempt = 0;

        const positionResult = await db.pool.query<{
          proxy_wallet: string;
          shares: string;
          avg_entry_price: string;
        }>(
          `
          SELECT proxy_wallet, shares::text, avg_entry_price::text
          FROM positions
          WHERE asset = $1
          `,
          [assetId],
        );

        for (const row of positionResult.rows) {
          const shares = Number.parseFloat(row.shares ?? '0');
          const avg = Number.parseFloat(row.avg_entry_price ?? '0');
          const costBasis = shares * avg;
          const currentValue = shares * currentPrice;
          const pnl = currentValue - costBasis;
          const pnlPct = costBasis > 0 ? pnl / costBasis : 0;
          await db.updatePositionPricePatch(
            row.proxy_wallet,
            assetId,
            currentPrice,
            pnl,
            pnlPct,
          );
        }
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
      clearHeartbeat();
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
      clearHeartbeat();
      ws.close();
    },
  };

  async function sendInitialSubscription(): Promise<void> {
    const result = await db.pool.query<{ asset: string }>(
      `
      SELECT DISTINCT asset
      FROM positions
      WHERE asset IS NOT NULL AND asset <> ''
      `,
    );
    subscribedAssetIds = new Set(
      result.rows.map((row) => row.asset).filter((asset) => !!asset),
    );

    if (
      !ws ||
      ws.readyState !== WebSocket.OPEN ||
      subscribedAssetIds.size === 0
    ) {
      return;
    }

    const payload = {
      type: 'market',
      assets_ids: [...subscribedAssetIds],
      custom_feature_enabled: true,
    };
    ws.send(JSON.stringify(payload));
  }

  function startHeartbeat(): void {
    clearHeartbeat();
    pingTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send('PING');
      }
    }, 10_000);
  }

  function clearHeartbeat(): void {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }
}

function resolvePrice(payload: MarketEvent): number {
  if (payload.event_type === 'best_bid_ask') {
    const bid =
      typeof payload.best_bid === 'number'
        ? payload.best_bid
        : Number.parseFloat(String(payload.best_bid ?? ''));
    const ask =
      typeof payload.best_ask === 'number'
        ? payload.best_ask
        : Number.parseFloat(String(payload.best_ask ?? ''));
    if (Number.isFinite(bid) && Number.isFinite(ask)) {
      return (bid + ask) / 2;
    }
  }

  const tradePrice =
    typeof payload.price === 'number'
      ? payload.price
      : Number.parseFloat(String(payload.price ?? ''));
  return Number.isFinite(tradePrice) ? tradePrice : Number.NaN;
}
