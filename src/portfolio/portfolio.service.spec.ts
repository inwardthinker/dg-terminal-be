import { PortfolioService } from './portfolio.service';
import { PortfolioClosedPositionsRepository } from './repositories/portfolio-closed-positions.repository';
import { PortfolioPositionsRepository } from './repositories/portfolio-positions.repository';
import { PortfolioSummaryRepository } from './repositories/portfolio-summary.repository';
import { PortfolioTradesRepository } from './repositories/portfolio-trades.repository';
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
  safe_wallet_address: '',
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
  safe_wallet_address: '',
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

const tradesSample = [{ id: 'trade-1' }, { id: 'trade-2' }];
const createTradesRepositoryMock = (): Pick<
  PortfolioTradesRepository,
  'findByWallet'
> => ({
  findByWallet: jest.fn().mockResolvedValue(tradesSample),
});

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
    const mockSummaryRepository: Pick<
      PortfolioSummaryRepository,
      'findByWallet'
    > = { findByWallet: jest.fn().mockResolvedValue(null) };
    const service = new PortfolioService(
      mockPositionsRepository as PortfolioPositionsRepository,
      mockClosedPositionsRepository as PortfolioClosedPositionsRepository,
      mockSummaryRepository as PortfolioSummaryRepository,
      createTradesRepositoryMock() as PortfolioTradesRepository,
    );

    const result = await service.getPositions({ walletAddress: wallet });

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
    const mockSummaryRepository: Pick<
      PortfolioSummaryRepository,
      'findByWallet'
    > = { findByWallet: jest.fn().mockResolvedValue(null) };
    const service = new PortfolioService(
      mockPositionsRepository as PortfolioPositionsRepository,
      mockClosedPositionsRepository as PortfolioClosedPositionsRepository,
      mockSummaryRepository as PortfolioSummaryRepository,
      createTradesRepositoryMock() as PortfolioTradesRepository,
    );
    await service.getPositions({ walletAddress: wallet });

    expect(mockPositionsRepository.findByWallet).toHaveBeenCalledWith({
      walletAddress: wallet,
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
    const mockSummaryRepository: Pick<
      PortfolioSummaryRepository,
      'findByWallet'
    > = { findByWallet: jest.fn().mockResolvedValue(null) };
    const service = new PortfolioService(
      mockPositionsRepository as PortfolioPositionsRepository,
      mockClosedPositionsRepository as PortfolioClosedPositionsRepository,
      mockSummaryRepository as PortfolioSummaryRepository,
      createTradesRepositoryMock() as PortfolioTradesRepository,
    );

    const result = await service.getClosedPositions({ walletAddress: wallet });

    expect(result.closed_positions).toHaveLength(3);
    expect(mockClosedPositionsRepository.findByWallet).toHaveBeenCalledWith({
      walletAddress: wallet,
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
    const mockSummaryRepository: Pick<
      PortfolioSummaryRepository,
      'findByWallet'
    > = { findByWallet: jest.fn().mockResolvedValue(null) };
    const service = new PortfolioService(
      mockPositionsRepository as PortfolioPositionsRepository,
      mockClosedPositionsRepository as PortfolioClosedPositionsRepository,
      mockSummaryRepository as PortfolioSummaryRepository,
      createTradesRepositoryMock() as PortfolioTradesRepository,
    );

    await service.getClosedPositions({
      walletAddress: wallet,
      limit: 50,
      offset: 10,
    });

    expect(mockClosedPositionsRepository.findByWallet).toHaveBeenCalledWith({
      walletAddress: wallet,
      limit: 50,
      offset: 10,
    });
  });

  it('returns summary from repository', async () => {
    const summary = {
      balance: 100,
      open_exposure: 40,
      unrealized_pnl: 5,
      realized_30d: 20,
      rewards_earned: 2,
      rewards_pct_of_pnl: 10,
      deployment_rate_pct: 28.57,
      balance_last_updated: '2026-01-01T00:00:00.000Z',
      open_exposure_last_updated: '2026-01-01T00:00:00.000Z',
      unrealized_pnl_last_updated: '2026-01-01T00:00:00.000Z',
      realized_30d_last_updated: '2026-01-01T00:00:00.000Z',
      rewards_last_updated: '2026-01-01T00:00:00.000Z',
    };
    const mockPositionsRepository: Pick<
      PortfolioPositionsRepository,
      'findByWallet'
    > = { findByWallet: jest.fn().mockResolvedValue(sample) };
    const mockClosedPositionsRepository: Pick<
      PortfolioClosedPositionsRepository,
      'findByWallet'
    > = { findByWallet: jest.fn().mockResolvedValue(closedSample) };
    const mockSummaryRepository: Pick<
      PortfolioSummaryRepository,
      'findByWallet'
    > = { findByWallet: jest.fn().mockResolvedValue(summary) };
    const service = new PortfolioService(
      mockPositionsRepository as PortfolioPositionsRepository,
      mockClosedPositionsRepository as PortfolioClosedPositionsRepository,
      mockSummaryRepository as PortfolioSummaryRepository,
      createTradesRepositoryMock() as PortfolioTradesRepository,
    );

    const result = await service.getSummary({ walletAddress: wallet });
    expect(result.summary).toEqual(summary);
    expect(mockSummaryRepository.findByWallet).toHaveBeenCalledWith(wallet);
  });

  it('returns zero summary when repository has no row', async () => {
    const mockPositionsRepository: Pick<
      PortfolioPositionsRepository,
      'findByWallet'
    > = { findByWallet: jest.fn().mockResolvedValue([]) };
    const mockClosedPositionsRepository: Pick<
      PortfolioClosedPositionsRepository,
      'findByWallet'
    > = { findByWallet: jest.fn().mockResolvedValue([]) };
    const mockSummaryRepository: Pick<
      PortfolioSummaryRepository,
      'findByWallet'
    > = { findByWallet: jest.fn().mockResolvedValue(null) };
    const service = new PortfolioService(
      mockPositionsRepository as PortfolioPositionsRepository,
      mockClosedPositionsRepository as PortfolioClosedPositionsRepository,
      mockSummaryRepository as PortfolioSummaryRepository,
      createTradesRepositoryMock() as PortfolioTradesRepository,
    );

    const result = await service.getSummary({ walletAddress: wallet });
    expect(result.summary).toEqual({
      balance: 0,
      open_exposure: 0,
      unrealized_pnl: 0,
      realized_30d: 0,
      rewards_earned: 0,
      rewards_pct_of_pnl: null,
      deployment_rate_pct: null,
      balance_last_updated: null,
      open_exposure_last_updated: null,
      unrealized_pnl_last_updated: null,
      realized_30d_last_updated: null,
      rewards_last_updated: null,
    });
  });

  it('returns normalized settled trades from closed positions', async () => {
    const query = {
      walletAddress: wallet,
      period: 'all' as const,
      page: 1,
      per_page: 1,
      sort_by: 'date',
      sort_dir: 'desc' as const,
      outcome: 'WON',
    };
    const mockTradesRepository: Pick<
      PortfolioTradesRepository,
      'findByWallet'
    > = {
      findByWallet: jest.fn().mockResolvedValue([]),
    };
    const mockPositionsRepository: Pick<
      PortfolioPositionsRepository,
      'findByWallet'
    > = { findByWallet: jest.fn().mockResolvedValue(sample) };
    const mockClosedPositionsRepository: Pick<
      PortfolioClosedPositionsRepository,
      'findByWallet'
    > = {
      findByWallet: jest.fn().mockResolvedValue([
        {
          ...closedSample[0],
          realized_pnl: 10,
          closed_at: '2026-01-08T00:00:00.000Z',
        },
        {
          ...closedSample[1],
          realized_pnl: -5,
          closed_at: '2026-01-01T00:00:00.000Z',
        },
      ]),
    };
    const mockSummaryRepository: Pick<
      PortfolioSummaryRepository,
      'findByWallet'
    > = { findByWallet: jest.fn().mockResolvedValue(null) };

    const service = new PortfolioService(
      mockPositionsRepository as PortfolioPositionsRepository,
      mockClosedPositionsRepository as PortfolioClosedPositionsRepository,
      mockSummaryRepository as PortfolioSummaryRepository,
      mockTradesRepository as PortfolioTradesRepository,
    );

    const result = await service.getTrades(query);

    expect(result.trades).toHaveLength(1);
    expect(result.page).toBe(1);
    expect(result.per_page).toBe(1);
    expect(result.total_count).toBe(1);
    expect(result.total_pages).toBe(1);
    expect(result.trades[0]).toEqual(
      expect.objectContaining({
        market: closedSample[0].market_name,
        entry_price: closedSample[0].avg_entry_price,
        exit_price: closedSample[0].current_price,
        size: closedSample[0].cost_basis,
        pnl: 10,
        outcome: 'WON',
      }),
    );
  });

  it('enriches trades with closed position pnl/outcome/exit_price', async () => {
    const enrichedTradesSample = [
      {
        id: 'trade-enrich',
        conditionId: 'cond-1',
        asset: 'asset-1',
        pnl: null,
        outcome: null,
        exit_price: null,
        venue: 'Polymarket',
      },
    ];
    const closedForEnrichment: PortfolioClosedPosition[] = [
      {
        ...closedSample[0],
        condition_id: 'cond-1',
        outcome_token_id: 'asset-1',
        realized_pnl: 42,
        current_price: 0.88,
        venue: 'Polymarket',
      },
    ];
    const mockTradesRepository: Pick<
      PortfolioTradesRepository,
      'findByWallet'
    > = {
      findByWallet: jest.fn().mockResolvedValue(enrichedTradesSample),
    };
    const mockPositionsRepository: Pick<
      PortfolioPositionsRepository,
      'findByWallet'
    > = { findByWallet: jest.fn().mockResolvedValue(sample) };
    const mockClosedPositionsRepository: Pick<
      PortfolioClosedPositionsRepository,
      'findByWallet'
    > = { findByWallet: jest.fn().mockResolvedValue(closedForEnrichment) };
    const mockSummaryRepository: Pick<
      PortfolioSummaryRepository,
      'findByWallet'
    > = { findByWallet: jest.fn().mockResolvedValue(null) };

    const service = new PortfolioService(
      mockPositionsRepository as PortfolioPositionsRepository,
      mockClosedPositionsRepository as PortfolioClosedPositionsRepository,
      mockSummaryRepository as PortfolioSummaryRepository,
      mockTradesRepository as PortfolioTradesRepository,
    );

    const result = await service.getTrades({
      walletAddress: wallet,
      period: 'all',
    });
    const first = (result.trades as Array<Record<string, unknown>>)[0];
    expect(first.pnl).toBe(42);
    expect(first.outcome).toBe('WON');
    expect(first.exit_price).toBe(0.88);
    expect(result.total_count).toBe(1);
    expect(result.total_pages).toBe(1);
    expect(mockClosedPositionsRepository.findByWallet).toHaveBeenCalledWith({
      walletAddress: wallet,
      limit: 500,
      offset: 0,
      sort_by: 'closed_at',
      sort_dir: 'desc',
    });
  });

  it('falls back to conditionId-only enrichment when asset is empty', async () => {
    const tradesWithoutAsset = [
      {
        id: 'trade-redeem',
        conditionId: 'cond-redeem',
        asset: '',
        pnl: null,
        outcome: null,
        exit_price: null,
        venue: 'Polymarket',
      },
    ];
    const closedForConditionFallback: PortfolioClosedPosition[] = [
      {
        ...closedSample[0],
        condition_id: 'cond-redeem',
        outcome_token_id: 'some-asset',
        realized_pnl: -3.5,
        current_price: 1,
        venue: 'Polymarket',
      },
    ];
    const mockTradesRepository: Pick<
      PortfolioTradesRepository,
      'findByWallet'
    > = {
      findByWallet: jest.fn().mockResolvedValue(tradesWithoutAsset),
    };
    const mockPositionsRepository: Pick<
      PortfolioPositionsRepository,
      'findByWallet'
    > = { findByWallet: jest.fn().mockResolvedValue(sample) };
    const mockClosedPositionsRepository: Pick<
      PortfolioClosedPositionsRepository,
      'findByWallet'
    > = {
      findByWallet: jest.fn().mockResolvedValue(closedForConditionFallback),
    };
    const mockSummaryRepository: Pick<
      PortfolioSummaryRepository,
      'findByWallet'
    > = { findByWallet: jest.fn().mockResolvedValue(null) };

    const service = new PortfolioService(
      mockPositionsRepository as PortfolioPositionsRepository,
      mockClosedPositionsRepository as PortfolioClosedPositionsRepository,
      mockSummaryRepository as PortfolioSummaryRepository,
      mockTradesRepository as PortfolioTradesRepository,
    );

    const result = await service.getTrades({
      walletAddress: wallet,
      period: 'all',
    });
    const first = (result.trades as Array<Record<string, unknown>>)[0];
    expect(first.pnl).toBe(-3.5);
    expect(first.outcome).toBe('LOST');
    expect(first.exit_price).toBe(1);
    expect(result.total_count).toBe(1);
    expect(result.total_pages).toBe(1);
  });

  it('returns empty trades when repository throws', async () => {
    const mockTradesRepository: Pick<
      PortfolioTradesRepository,
      'findByWallet'
    > = {
      findByWallet: jest.fn().mockResolvedValue([]),
    };
    const mockPositionsRepository: Pick<
      PortfolioPositionsRepository,
      'findByWallet'
    > = { findByWallet: jest.fn().mockResolvedValue(sample) };
    const mockSummaryRepository: Pick<
      PortfolioSummaryRepository,
      'findByWallet'
    > = { findByWallet: jest.fn().mockResolvedValue(null) };

    const erroringClosedRepository: Pick<
      PortfolioClosedPositionsRepository,
      'findByWallet'
    > = {
      findByWallet: jest.fn().mockRejectedValue(new Error('boom')),
    };
    const erroringService = new PortfolioService(
      mockPositionsRepository as PortfolioPositionsRepository,
      erroringClosedRepository as PortfolioClosedPositionsRepository,
      mockSummaryRepository as PortfolioSummaryRepository,
      mockTradesRepository as PortfolioTradesRepository,
    );

    const result = await erroringService.getTrades({ walletAddress: wallet });
    expect(result).toEqual({
      trades: [],
      page: 1,
      per_page: 25,
      total_count: 0,
      total_pages: 0,
    });
  });
});
