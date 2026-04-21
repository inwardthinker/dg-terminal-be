import test from 'node:test';
import assert from 'node:assert/strict';
import { runLoopB } from './loop-b';
import type { WorkerDb } from '../db';
import type { PolymarketDataApi } from '../polymarket';

test('runLoopB upserts positions and summary exposure for each wallet', async () => {
  const summaryCalls: Array<{ userId: number; wallet: string }> = [];
  const orphanCalls: Array<{ wallet: string; assets: string[] }> = [];
  const db = {
    getWalletUsers: async () => [
      { userId: 2, wallet: '0xbbb' },
      { userId: 1, wallet: '0xaaa' },
    ],
    upsertPositions: async () => undefined,
    deletePositionOrphans: async (wallet: string, assets: string[]) => {
      orphanCalls.push({ wallet, assets });
    },
    upsertPortfolioSummaryExposure: async (userId: number, wallet: string) => {
      summaryCalls.push({ userId, wallet });
    },
  } as unknown as WorkerDb;

  const api = {
    getOpenPositions: async (wallet: string) => [
      {
        asset: `${wallet}-asset-1`,
        conditionId: 'cond-1',
        size: '2',
        avgPrice: '1',
        curPrice: '1.2',
      },
    ],
  } as unknown as PolymarketDataApi;

  await runLoopB(db, api);

  assert.deepEqual(summaryCalls, [
    { userId: 1, wallet: '0xaaa' },
    { userId: 2, wallet: '0xbbb' },
  ]);
  assert.deepEqual(orphanCalls, [
    { wallet: '0xaaa', assets: ['0xaaa-asset-1'] },
    { wallet: '0xbbb', assets: ['0xbbb-asset-1'] },
  ]);
});

test('runLoopB continues when one wallet fails', async () => {
  const summaryCalls: Array<{ userId: number; wallet: string }> = [];
  const db = {
    getWalletUsers: async () => [
      { userId: 1, wallet: '0xaaa' },
      { userId: 2, wallet: '0xbbb' },
    ],
    upsertPositions: async () => undefined,
    deletePositionOrphans: async () => undefined,
    upsertPortfolioSummaryExposure: async (userId: number, wallet: string) => {
      summaryCalls.push({ userId, wallet });
    },
  } as unknown as WorkerDb;

  const api = {
    getOpenPositions: async (wallet: string) => {
      if (wallet === '0xaaa') {
        throw new Error('failed wallet');
      }
      return [
        {
          asset: 'asset-2',
          conditionId: 'cond-2',
          size: '2',
          avgPrice: '1',
          curPrice: '1.1',
        },
      ];
    },
  } as unknown as PolymarketDataApi;

  await runLoopB(db, api);

  assert.deepEqual(summaryCalls, [{ userId: 2, wallet: '0xbbb' }]);
});
