import { PolymarketClientService } from '../polymarket/polymarket-client.service';
import { PortfolioService } from './portfolio.service';
import { PortfolioClosedPosition } from './types/portfolio-closed-position.type';
import { PortfolioPosition } from './types/portfolio-position.type';
import { sortClosedPortfolioPositions } from './utils/sort-closed-positions.util';
import { sortPortfolioPositions } from './utils/sort-positions.util';

const testWallet = '0x1111111111111111111111111111111111111111';

const openRowDefaults: Omit<
  PortfolioPosition,
  | 'market_name'
  | 'category'
  | 'side'
  | 'avg_entry_price'
  | 'current_price'
  | 'shares'
  | 'cost_basis'
  | 'unrealized_pnl'
  | 'unrealized_pnl_pct'
  | 'exposure'
> = {
  venue: 'Polymarket',
  condition_id: '',
  outcome_token_id: '',
  proxy_wallet: '',
  slug: '',
  icon: '',
  event_id: '',
  event_slug: '',
  outcome_index: 0,
  opposite_outcome: '',
  opposite_asset: '',
  end_date: '',
  redeemable: false,
  mergeable: false,
  negative_risk: false,
  total_bought: 0,
  realized_pnl: 0,
  percent_realized_pnl: 0,
  initial_value: 0,
  current_value: 0,
  percent_pnl: 0,
};

const sample: PortfolioPosition[] = [
  {
    ...openRowDefaults,
    market_name: 'BTC > 100k',
    category: 'Crypto',
    side: 'YES',
    avg_entry_price: 0.5,
    current_price: 0.6,
    shares: 100,
    cost_basis: 50,
    unrealized_pnl: 10,
    unrealized_pnl_pct: 0.2,
    exposure: 300,
    total_bought: 100,
    initial_value: 50,
    current_value: 300,
  },
  {
    ...openRowDefaults,
    market_name: 'NBA Finals',
    category: 'Sports',
    side: 'NO',
    avg_entry_price: 0.4,
    current_price: 0.3,
    shares: 300,
    cost_basis: 120,
    unrealized_pnl: -30,
    unrealized_pnl_pct: -0.25,
    exposure: 900,
    total_bought: 300,
    initial_value: 120,
    current_value: 900,
  },
  {
    ...openRowDefaults,
    market_name: 'US Election',
    category: 'Politics',
    side: 'YES',
    avg_entry_price: 0.6,
    current_price: 0.7,
    shares: 500,
    cost_basis: 300,
    unrealized_pnl: 50,
    unrealized_pnl_pct: 0.17,
    exposure: 1000,
    total_bought: 500,
    initial_value: 300,
    current_value: 1000,
  },
  {
    ...openRowDefaults,
    market_name: 'Senate Seat',
    category: 'Politics',
    side: 'NO',
    avg_entry_price: 0.3,
    current_price: 0.4,
    shares: 500,
    cost_basis: 150,
    unrealized_pnl: 50,
    unrealized_pnl_pct: 0.33,
    exposure: 500,
    total_bought: 500,
    initial_value: 150,
    current_value: 500,
  },
];

describe('sortPortfolioPositions', () => {
  it('orders categories by total exposure desc by default', () => {
    const result = sortPortfolioPositions(sample, { wallet: testWallet });

    expect(result.map((position) => position.category)).toEqual([
      'Politics',
      'Politics',
      'Sports',
      'Crypto',
    ]);
  });

  it('orders rows by exposure desc within each category', () => {
    const result = sortPortfolioPositions(sample, { wallet: testWallet });

    expect(result[0].market_name).toBe('US Election');
    expect(result[1].market_name).toBe('Senate Seat');
  });

  it('sorts by unrealized_pnl asc when sort_by is set', () => {
    const result = sortPortfolioPositions(sample, {
      wallet: testWallet,
      sort_by: 'unrealized_pnl',
      sort_dir: 'asc',
    });
    const pnls = result.map((position) => position.unrealized_pnl);

    expect(pnls).toEqual([...pnls].sort((a, b) => a - b));
  });

  it('defaults sort_dir to desc when sort_by is set and sort_dir is absent', () => {
    const result = sortPortfolioPositions(sample, {
      wallet: testWallet,
      sort_by: 'exposure',
    });
    const exposures = result.map((position) => position.exposure);

    expect(exposures).toEqual([...exposures].sort((a, b) => b - a));
  });
});

const closedRowDefaults: Omit<
  PortfolioClosedPosition,
  | 'market_name'
  | 'category'
  | 'side'
  | 'avg_entry_price'
  | 'current_price'
  | 'shares'
  | 'cost_basis'
  | 'realized_pnl'
  | 'realized_pnl_pct'
  | 'end_date'
  | 'closed_at'
> = {
  venue: 'Polymarket',
  condition_id: '',
  outcome_token_id: '',
  proxy_wallet: '',
  slug: '',
  icon: '',
  event_id: '',
  event_slug: '',
  outcome_index: 0,
  opposite_outcome: '',
  opposite_asset: '',
};

const closedSample: PortfolioClosedPosition[] = [
  {
    ...closedRowDefaults,
    market_name: 'A',
    category: 'Sports',
    side: 'YES',
    avg_entry_price: 0.5,
    current_price: 1,
    shares: 100,
    cost_basis: 50,
    realized_pnl: 50,
    realized_pnl_pct: 1,
    end_date: '2026-01-01T00:00:00Z',
    closed_at: '2026-01-02T00:00:00.000Z',
  },
  {
    ...closedRowDefaults,
    market_name: 'B',
    category: 'Sports',
    side: 'NO',
    avg_entry_price: 0.4,
    current_price: 1,
    shares: 200,
    cost_basis: 80,
    realized_pnl: 120,
    realized_pnl_pct: 1.5,
    end_date: '2026-01-03T00:00:00Z',
    closed_at: '2026-01-04T00:00:00.000Z',
  },
  {
    ...closedRowDefaults,
    market_name: 'C',
    category: 'Politics',
    side: 'YES',
    avg_entry_price: 0.6,
    current_price: 1,
    shares: 50,
    cost_basis: 30,
    realized_pnl: 20,
    realized_pnl_pct: 0.67,
    end_date: '2026-01-05T00:00:00Z',
    closed_at: '2026-01-06T00:00:00.000Z',
  },
];

describe('sortClosedPortfolioPositions', () => {
  it('orders categories by total realized PnL desc by default', () => {
    const result = sortClosedPortfolioPositions(closedSample, {
      wallet: testWallet,
    });

    expect(result.map((p) => p.category)).toEqual([
      'Sports',
      'Sports',
      'Politics',
    ]);
  });

  it('sorts by realized_pnl asc when sort_by is set', () => {
    const result = sortClosedPortfolioPositions(closedSample, {
      wallet: testWallet,
      sort_by: 'realized_pnl',
      sort_dir: 'asc',
    });
    const pnls = result.map((p) => p.realized_pnl);

    expect(pnls).toEqual([...pnls].sort((a, b) => a - b));
  });
});

describe('PortfolioService', () => {
  const wallet = testWallet;

  it('returns default-sorted positions shape', async () => {
    const mockPolymarketClientService: Pick<
      PolymarketClientService,
      'getOpenPositions'
    > = {
      getOpenPositions: jest.fn().mockResolvedValue(sample),
    };
    const service = new PortfolioService(
      mockPolymarketClientService as PolymarketClientService,
    );

    const result = await service.getPositions({ wallet });

    expect(result.positions).toHaveLength(4);
    expect(result.positions.map((position) => position.category)).toEqual([
      'Politics',
      'Politics',
      'Sports',
      'Crypto',
    ]);
  });

  it('forwards wallet query param to polymarket client', async () => {
    const mockPolymarketClientService: Pick<
      PolymarketClientService,
      'getOpenPositions'
    > = {
      getOpenPositions: jest.fn().mockResolvedValue(sample),
    };
    const service = new PortfolioService(
      mockPolymarketClientService as PolymarketClientService,
    );
    await service.getPositions({ wallet });

    expect(mockPolymarketClientService.getOpenPositions).toHaveBeenCalledWith(
      wallet,
    );
  });

  it('returns closed positions with default limit/offset', async () => {
    const mockPolymarketClientService: Pick<
      PolymarketClientService,
      'getClosedPositions'
    > = {
      getClosedPositions: jest.fn().mockResolvedValue(closedSample),
    };
    const service = new PortfolioService(
      mockPolymarketClientService as PolymarketClientService,
    );

    const result = await service.getClosedPositions({ wallet });

    expect(result.closed_positions).toHaveLength(3);
    expect(mockPolymarketClientService.getClosedPositions).toHaveBeenCalledWith(
      wallet,
      { limit: 30, offset: 0 },
    );
  });

  it('forwards limit and offset to polymarket client for closed positions', async () => {
    const mockPolymarketClientService: Pick<
      PolymarketClientService,
      'getClosedPositions'
    > = {
      getClosedPositions: jest.fn().mockResolvedValue([]),
    };
    const service = new PortfolioService(
      mockPolymarketClientService as PolymarketClientService,
    );

    await service.getClosedPositions({
      wallet,
      limit: 50,
      offset: 10,
    });

    expect(mockPolymarketClientService.getClosedPositions).toHaveBeenCalledWith(
      wallet,
      { limit: 50, offset: 10 },
    );
  });
});
