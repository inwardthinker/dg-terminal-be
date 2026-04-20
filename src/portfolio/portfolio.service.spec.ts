import { PortfolioService } from './portfolio.service';
import { PortfolioClosedPositionsRepository } from './repositories/portfolio-closed-positions.repository';
import { PortfolioPositionsRepository } from './repositories/portfolio-positions.repository';
import { PortfolioClosedPosition } from './types/portfolio-closed-position.type';
import { PortfolioPosition } from './types/portfolio-position.type';

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

describe('PortfolioService', () => {
  const wallet = testWallet;

  it('returns positions from repository', async () => {
    const mockPositionsRepository: Pick<
      PortfolioPositionsRepository,
      'findByWallet'
    > = {
      findByWallet: jest.fn().mockResolvedValue(sample),
    };
    const mockClosedPositionsRepository: Pick<
      PortfolioClosedPositionsRepository,
      'findByWallet'
    > = { findByWallet: jest.fn().mockResolvedValue(closedSample) };
    const service = new PortfolioService(
      mockPositionsRepository as PortfolioPositionsRepository,
      mockClosedPositionsRepository as PortfolioClosedPositionsRepository,
    );

    const result = await service.getPositions({ wallet });

    expect(result.positions).toHaveLength(4);
  });

  it('forwards wallet query param to positions repository', async () => {
    const mockPositionsRepository: Pick<
      PortfolioPositionsRepository,
      'findByWallet'
    > = {
      findByWallet: jest.fn().mockResolvedValue(sample),
    };
    const mockClosedPositionsRepository: Pick<
      PortfolioClosedPositionsRepository,
      'findByWallet'
    > = { findByWallet: jest.fn().mockResolvedValue([]) };
    const service = new PortfolioService(
      mockPositionsRepository as PortfolioPositionsRepository,
      mockClosedPositionsRepository as PortfolioClosedPositionsRepository,
    );
    await service.getPositions({ wallet });

    expect(mockPositionsRepository.findByWallet).toHaveBeenCalledWith({
      wallet,
    });
  });

  it('returns closed positions', async () => {
    const mockClosedPositionsRepository: Pick<
      PortfolioClosedPositionsRepository,
      'findByWallet'
    > = {
      findByWallet: jest.fn().mockResolvedValue(closedSample),
    };
    const mockPositionsRepository: Pick<
      PortfolioPositionsRepository,
      'findByWallet'
    > = { findByWallet: jest.fn().mockResolvedValue(sample) };
    const service = new PortfolioService(
      mockPositionsRepository as PortfolioPositionsRepository,
      mockClosedPositionsRepository as PortfolioClosedPositionsRepository,
    );

    const result = await service.getClosedPositions({ wallet });

    expect(result.closed_positions).toHaveLength(3);
    expect(mockClosedPositionsRepository.findByWallet).toHaveBeenCalledWith({
      wallet,
    });
  });

  it('forwards limit and offset to closed positions repository', async () => {
    const mockClosedPositionsRepository: Pick<
      PortfolioClosedPositionsRepository,
      'findByWallet'
    > = {
      findByWallet: jest.fn().mockResolvedValue([]),
    };
    const mockPositionsRepository: Pick<
      PortfolioPositionsRepository,
      'findByWallet'
    > = { findByWallet: jest.fn().mockResolvedValue([]) };
    const service = new PortfolioService(
      mockPositionsRepository as PortfolioPositionsRepository,
      mockClosedPositionsRepository as PortfolioClosedPositionsRepository,
    );

    await service.getClosedPositions({
      wallet,
      limit: 50,
      offset: 10,
    });

    expect(mockClosedPositionsRepository.findByWallet).toHaveBeenCalledWith({
      wallet,
      limit: 50,
      offset: 10,
    });
  });
});
