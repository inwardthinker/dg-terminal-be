import test from 'node:test';
import assert from 'node:assert/strict';
import { runLoopC } from './loop-c';
import type { WorkerDb } from '../db';
import type { PolymarketDataApi } from '../polymarket';

test('runLoopC writes rewards summary for each wallet', async () => {
  const rewardCalls: Array<{
    userId: number;
    wallet: string;
    rewards: number;
  }> = [];
  const db = {
    getWalletUsers: async () => [
      { userId: 2, wallet: '0xbbb' },
      { userId: 1, wallet: '0xaaa' },
    ],
    upsertPortfolioSummaryRewards: async (
      userId: number,
      wallet: string,
      rewards: number,
    ) => {
      rewardCalls.push({ userId, wallet, rewards });
    },
  } as unknown as WorkerDb;

  const api = {
    getActivity: async (wallet: string) =>
      wallet === '0xaaa'
        ? [
            {
              type: 'REWARD',
              amount: '4',
              timestamp: '2026-04-20T00:00:00.000Z',
            },
          ]
        : [
            {
              type: 'REBATE',
              amount: '6',
              timestamp: '2026-04-20T00:00:00.000Z',
            },
          ],
  } as unknown as PolymarketDataApi;

  await runLoopC(db, api);

  assert.deepEqual(rewardCalls, [
    { userId: 1, wallet: '0xaaa', rewards: 4 },
    { userId: 2, wallet: '0xbbb', rewards: 6 },
  ]);
});

test('runLoopC isolates per-wallet failures', async () => {
  const rewardCalls: Array<{
    userId: number;
    wallet: string;
    rewards: number;
  }> = [];
  const db = {
    getWalletUsers: async () => [
      { userId: 1, wallet: '0xaaa' },
      { userId: 2, wallet: '0xbbb' },
    ],
    upsertPortfolioSummaryRewards: async (
      userId: number,
      wallet: string,
      rewards: number,
    ) => {
      rewardCalls.push({ userId, wallet, rewards });
    },
  } as unknown as WorkerDb;

  const api = {
    getActivity: async (wallet: string) => {
      if (wallet === '0xaaa') throw new Error('activity failed');
      return [
        { type: 'REWARD', amount: '3', timestamp: '2026-04-20T00:00:00.000Z' },
      ];
    },
  } as unknown as PolymarketDataApi;

  await runLoopC(db, api);
  assert.deepEqual(rewardCalls, [{ userId: 2, wallet: '0xbbb', rewards: 3 }]);
});
