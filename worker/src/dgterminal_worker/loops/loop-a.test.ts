import test from 'node:test';
import assert from 'node:assert/strict';
import { runLoopA } from './loop-a';
import type { WorkerDb, PortfolioSummaryBalanceUpsertRow } from '../db';
import type { PolymarketDataApi } from '../polymarket';

test('runLoopA writes one balance row per wallet user', async () => {
  const written: PortfolioSummaryBalanceUpsertRow[] = [];
  const db = {
    getWalletUsers: async () => [
      { userId: 2, wallet: '0xbbb' },
      { userId: 1, wallet: '0xaaa' },
    ],
    upsertPortfolioSummaryBalance: async (
      rows: PortfolioSummaryBalanceUpsertRow[],
    ) => {
      written.push(...rows);
    },
  } as unknown as WorkerDb;

  const api = {
    getSnapshot: async (wallet: string) => (wallet === '0xaaa' ? 10 : 20),
  } as unknown as PolymarketDataApi;

  await runLoopA(db, api);

  assert.deepEqual(written, [
    { userId: 1, safeWalletAddress: '0xaaa', balance: 10 },
    { userId: 2, safeWalletAddress: '0xbbb', balance: 20 },
  ]);
});

test('runLoopA continues when one wallet snapshot fails', async () => {
  const written: PortfolioSummaryBalanceUpsertRow[] = [];
  const db = {
    getWalletUsers: async () => [
      { userId: 1, wallet: '0xaaa' },
      { userId: 2, wallet: '0xbbb' },
    ],
    upsertPortfolioSummaryBalance: async (
      rows: PortfolioSummaryBalanceUpsertRow[],
    ) => {
      written.push(...rows);
    },
  } as unknown as WorkerDb;

  const api = {
    getSnapshot: async (wallet: string) => {
      if (wallet === '0xaaa') {
        throw new Error('snapshot failed');
      }
      return 20;
    },
  } as unknown as PolymarketDataApi;

  await runLoopA(db, api);

  assert.deepEqual(written, [
    { userId: 2, safeWalletAddress: '0xbbb', balance: 20 },
  ]);
});
