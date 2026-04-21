import test from 'node:test';
import assert from 'node:assert/strict';
import { runLoopD } from './loop-d';
import type { WorkerDb } from '../db';
import type { PolymarketDataApi } from '../polymarket';

test('runLoopD writes trade history and realized_30d summary per wallet', async () => {
  const realizedCalls: Array<{ userId: number; wallet: string }> = [];
  const db = {
    getWalletUsers: async () => [
      { userId: 2, wallet: '0xbbb' },
      { userId: 1, wallet: '0xaaa' },
    ],
    upsertTradeHistory: async () => undefined,
    upsertPortfolioSummaryRealized30d: async (
      userId: number,
      wallet: string,
    ) => {
      realizedCalls.push({ userId, wallet });
    },
  } as unknown as WorkerDb;

  const api = {
    getClosedPositions: async () => [
      {
        id: 'trade-1',
        conditionId: 'cond-1',
        size: '1',
        avgPrice: '1',
        curPrice: '1.2',
        realizedPnl: '2',
        timestamp: '1713657600',
      },
    ],
  } as unknown as PolymarketDataApi;

  await runLoopD(db, api);
  assert.deepEqual(realizedCalls, [
    { userId: 1, wallet: '0xaaa' },
    { userId: 2, wallet: '0xbbb' },
  ]);
});

test('runLoopD isolates per-wallet failures', async () => {
  const realizedCalls: Array<{ userId: number; wallet: string }> = [];
  const db = {
    getWalletUsers: async () => [
      { userId: 1, wallet: '0xaaa' },
      { userId: 2, wallet: '0xbbb' },
    ],
    upsertTradeHistory: async () => undefined,
    upsertPortfolioSummaryRealized30d: async (
      userId: number,
      wallet: string,
    ) => {
      realizedCalls.push({ userId, wallet });
    },
  } as unknown as WorkerDb;

  const api = {
    getClosedPositions: async (wallet: string) => {
      if (wallet === '0xaaa') throw new Error('closed positions failed');
      return [
        {
          id: 'trade-2',
          conditionId: 'cond-2',
          size: '1',
          avgPrice: '1',
          curPrice: '1.1',
          realizedPnl: '1',
          timestamp: '1713657600',
        },
      ];
    },
  } as unknown as PolymarketDataApi;

  await runLoopD(db, api);
  assert.deepEqual(realizedCalls, [{ userId: 2, wallet: '0xbbb' }]);
});
