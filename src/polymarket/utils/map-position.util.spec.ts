import { mapPolymarketPosition } from './map-position.util';

describe('mapPolymarketPosition', () => {
  it('maps raw position fields correctly', () => {
    const mapped = mapPolymarketPosition({
      market: 'US Election',
      condition_id: 'cond-1',
      side: 'YES',
      size: '500',
      avg_price: '0.6',
      cur_price: '0.7',
    });

    expect(mapped.market_name).toBe('US Election');
    expect(mapped.condition_id).toBe('cond-1');
    expect(mapped.category).toBe('Unknown');
    expect(mapped.venue).toBe('Polymarket');
    expect(mapped.shares).toBe(500);
    expect(mapped.cost_basis).toBeCloseTo(300);
    expect(mapped.exposure).toBeCloseTo(350);
    expect(mapped.unrealized_pnl).toBeCloseTo(50);
    expect(mapped.unrealized_pnl_pct).toBeCloseTo(50 / 300);
    expect(mapped.total_bought).toBe(500);
    expect(mapped.initial_value).toBeCloseTo(300);
    expect(mapped.current_value).toBeCloseTo(350);
  });

  it('returns zero pnl_pct when cost_basis is zero', () => {
    const mapped = mapPolymarketPosition({
      market: 'Test',
      condition_id: 'cond-1',
      side: 'YES',
      size: '100',
      avg_price: '0',
      cur_price: '0.5',
    });

    expect(mapped.cost_basis).toBe(0);
    expect(mapped.unrealized_pnl_pct).toBe(0);
  });

  it('uses provided category when available', () => {
    const mapped = mapPolymarketPosition({
      market: 'Fed Rate Cut',
      condition_id: 'cond-2',
      category: 'Macro',
      side: 'NO',
      size: '10',
      avg_price: '0.2',
      cur_price: '0.3',
    });

    expect(mapped.category).toBe('Macro');
  });

  it('maps Polymarket Data API position fields', () => {
    const mapped = mapPolymarketPosition({
      market: 'Arizona Diamondbacks vs. Baltimore Orioles',
      condition_id:
        '0x600f38d80c2f97f8fd2a82ca7b672b1691d075d7346f2702e7daa5ac1c5af536',
      outcome_token_id:
        '7900631110900880644634412921596970867180695032409057823168978718112729798237',
      proxy_wallet: '0xbddf61af533ff524d27154e589d2d7a81510c684',
      side: 'Arizona Diamondbacks',
      size: '323873.8085',
      avg_price: '0.39',
      cur_price: '1',
      initial_value: '126310.7853',
      current_value: '323873.8085',
      cash_pnl: '197563.0231',
      percent_pnl: '156.4102',
      total_bought: '323873.8085',
      realized_pnl: '0',
      percent_realized_pnl: '156.4102',
      slug: 'mlb-ari-bal-2026-04-14',
      icon: 'https://example.com/mlb.jpg',
      event_id: '357340',
      event_slug: 'mlb-ari-bal-2026-04-14',
      outcome_index: '0',
      opposite_outcome: 'Baltimore Orioles',
      opposite_asset:
        '49110602170979429152740051659863343929871474411049766812504588133249313493605',
      end_date: '2026-04-21',
      redeemable: 'true',
      mergeable: 'false',
      negative_risk: 'false',
    });

    expect(mapped.cost_basis).toBeCloseTo(126310.7853);
    expect(mapped.exposure).toBeCloseTo(323873.8085);
    expect(mapped.unrealized_pnl).toBeCloseTo(197563.0231);
    expect(mapped.percent_pnl).toBeCloseTo(156.4102);
    expect(mapped.condition_id).toContain('0x600f');
    expect(mapped.outcome_token_id).toContain('790063');
    expect(mapped.slug).toBe('mlb-ari-bal-2026-04-14');
    expect(mapped.redeemable).toBe(true);
    expect(mapped.mergeable).toBe(false);
    expect(mapped.outcome_index).toBe(0);
  });

  it('parses boolean fields from JSON booleans via string in raw', () => {
    const mapped = mapPolymarketPosition({
      market: 'M',
      condition_id: 'c',
      side: 'Y',
      size: '1',
      avg_price: '0.5',
      cur_price: '0.5',
      redeemable: 'true',
      mergeable: 'false',
    });
    expect(mapped.redeemable).toBe(true);
    expect(mapped.mergeable).toBe(false);
  });
});
