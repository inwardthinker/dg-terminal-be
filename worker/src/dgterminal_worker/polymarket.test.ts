import test from 'node:test';
import assert from 'node:assert/strict';
import { PolymarketDataApi } from './polymarket';
import type { WorkerConfig } from './config';

function createConfig(): WorkerConfig {
  return {
    db: {
      host: 'localhost',
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: 'postgres',
    },
    polymarket: {
      dataApiBaseUrl: 'https://data-api.test',
      gammaBaseUrl: 'https://gamma-api.test',
      clobWsUrl: 'wss://ws-subscriptions-clob.polymarket.com/ws/market',
    },
    intervalsMs: {
      loopA: 10_000,
      loopB: 30_000,
      loopC: 60_000,
      loopD: 300_000,
    },
  };
}

test('getSnapshot returns numeric balance from snapshot payload', async () => {
  const api = new PolymarketDataApi(createConfig());
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({ balance: '123.45' }),
    }) as Response) as typeof fetch;

  try {
    const balance = await api.getSnapshot('0xabc');
    assert.equal(balance, 123.45);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('getOpenPositions supports object payload with data array', async () => {
  const api = new PolymarketDataApi(createConfig());
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        data: [{ conditionId: 'cond-1', size: '10', curPrice: '0.5' }],
      }),
    }) as Response) as typeof fetch;

  try {
    const rows = await api.getOpenPositions('0xabc');
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.conditionId, 'cond-1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('getClosedPositions supports object payload with positions array', async () => {
  const api = new PolymarketDataApi(createConfig());
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        positions: [{ conditionId: 'cond-2', realizedPnl: '5' }],
      }),
    }) as Response) as typeof fetch;

  try {
    const rows = await api.getClosedPositions('0xabc');
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.conditionId, 'cond-2');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
