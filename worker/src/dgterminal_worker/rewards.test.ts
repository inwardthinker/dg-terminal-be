import test from 'node:test';
import assert from 'node:assert/strict';
import { sumRewardsEarned30d } from './rewards';

test('sumRewardsEarned30d includes only allowed types in 30d window', () => {
  const now = new Date('2026-04-21T00:00:00.000Z');
  const rows = [
    { type: 'REWARD', amount: '10', timestamp: '2026-04-20T00:00:00.000Z' },
    { type: 'rebate', amount: 5, ts: '2026-04-19T00:00:00.000Z' },
    { type: 'FEE', amount: 999, timestamp: '2026-04-20T00:00:00.000Z' },
    {
      type: 'VOLUME_BONUS',
      amount: '7',
      timestamp: '2026-03-01T00:00:00.000Z',
    },
    {
      type: 'MAKER_REBATE',
      amount: '2.5',
      timestamp: '2026-04-10T00:00:00.000Z',
    },
  ];

  const total = sumRewardsEarned30d(rows, now);
  assert.equal(total, 17.5);
});
