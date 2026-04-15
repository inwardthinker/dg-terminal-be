import { mapPolymarketClosedPosition } from './map-closed-position.util';

describe('mapPolymarketClosedPosition', () => {
  it('maps Polymarket Data API closed position fields', () => {
    const mapped = mapPolymarketClosedPosition({
      market: 'Magic vs. Celtics',
      condition_id:
        '0x7aea2611f3dcf28b5b75eb00cadf7140f3617849e7383d16c18793adf5817302',
      outcome_token_id:
        '42226471287631305147124009130697472279390700811292616532685434752232432877995',
      proxy_wallet: '0xbddf61af533ff524d27154e589d2d7a81510c684',
      category: 'Sports',
      side: 'Celtics',
      size: '569995.893467',
      avg_price: '0.15',
      cur_price: '1',
      realized_pnl: '484496.509446',
      end_date: '2026-04-12T00:00:00Z',
      timestamp: 1776084133,
      slug: 'nba-orl-bos-2026-04-12',
      icon: 'https://polymarket-upload.s3.us-east-2.amazonaws.com/icon.png',
      event_slug: 'nba-orl-bos-2026-04-12',
      outcome_index: '1',
      opposite_outcome: 'Magic',
      opposite_asset:
        '51874337942577915781329949763643476276966641550592331786851895684826588929622',
    });

    expect(mapped.market_name).toBe('Magic vs. Celtics');
    expect(mapped.condition_id).toContain('0x7aea');
    expect(mapped.outcome_token_id).toContain('422264');
    expect(mapped.proxy_wallet).toContain('0xbddf');
    expect(mapped.slug).toBe('nba-orl-bos-2026-04-12');
    expect(mapped.event_slug).toBe('nba-orl-bos-2026-04-12');
    expect(mapped.outcome_index).toBe(1);
    expect(mapped.opposite_outcome).toBe('Magic');
    expect(mapped.side).toBe('Celtics');
    expect(mapped.shares).toBeCloseTo(569995.893467);
    expect(mapped.avg_entry_price).toBeCloseTo(0.15);
    expect(mapped.current_price).toBeCloseTo(1);
    expect(mapped.realized_pnl).toBeCloseTo(484496.509446);
    expect(mapped.cost_basis).toBeCloseTo(569995.893467 * 0.15);
    expect(mapped.end_date).toBe('2026-04-12T00:00:00Z');
    expect(mapped.closed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(mapped.venue).toBe('Polymarket');
  });
});
