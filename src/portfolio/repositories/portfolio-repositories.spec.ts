import { PortfolioClosedPositionsRepository } from './portfolio-closed-positions.repository';
import { PortfolioHistoryRepository } from './portfolio-history.repository';
import { PortfolioPositionsRepository } from './portfolio-positions.repository';
import { PortfolioSummaryRepository } from './portfolio-summary.repository';
import { PortfolioTradesRepository } from './portfolio-trades.repository';

type MockPool = {
  query: jest.Mock;
};

describe('Portfolio repositories sort mappings', () => {
  it('maps open positions outcome_token_id sort to asset column', async () => {
    const pool: MockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };
    const repo = new PortfolioPositionsRepository(pool as never);

    await repo.findByWallet({
      walletAddress: '0x1111111111111111111111111111111111111111',
      sort_by: 'outcome_token_id',
      sort_dir: 'asc',
    });

    const firstCall = pool.query.mock.calls[0] as unknown[] | undefined;
    const sql = (firstCall?.[0] as string | undefined) ?? '';
    expect(sql).toContain('ORDER BY asset ASC');
  });

  it('maps closed positions closed_at sort to trade_time column', async () => {
    const pool: MockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };
    const repo = new PortfolioClosedPositionsRepository(pool as never);

    await repo.findByWallet({
      walletAddress: '0x1111111111111111111111111111111111111111',
      sort_by: 'closed_at',
      sort_dir: 'desc',
    });

    const firstCall = pool.query.mock.calls[0] as unknown[] | undefined;
    const sql = (firstCall?.[0] as string | undefined) ?? '';
    expect(sql).toContain('ORDER BY trade_time DESC');
  });

  it('aggregates summary fields from portfolio_summary table', async () => {
    const pool: MockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };
    const repo = new PortfolioSummaryRepository(pool as never);

    await repo.findByWallet('0x1111111111111111111111111111111111111111');

    const firstCall = pool.query.mock.calls[0] as unknown[] | undefined;
    const sql = (firstCall?.[0] as string | undefined) ?? '';
    expect(sql).toContain('FROM portfolio_summary');
    expect(sql).toContain('COALESCE(SUM(balance), 0)');
    expect(sql).toContain('MIN(balance_last_updated)');
  });

  it('queries equity snapshots and returns [] when fewer than 3 points', async () => {
    const pool: MockPool = {
      query: jest.fn().mockResolvedValue({
        rows: [
          { date: '2026-01-01', balance_value: '100' },
          { date: '2026-01-02', balance_value: '101' },
        ],
      }),
    };
    const repo = new PortfolioHistoryRepository(pool as never);

    const snapshots = await repo.findByUserId('123');

    const firstCall = pool.query.mock.calls[0] as unknown[] | undefined;
    const sql = (firstCall?.[0] as string | undefined) ?? '';
    expect(sql).toContain('FROM equity_snapshots_user');
    expect(snapshots).toEqual([
      { date: '2026-01-01', balanceValue: 100 },
      { date: '2026-01-02', balanceValue: 101 },
    ]);
  });

  it('returns normalized history snapshots for enough points', async () => {
    const pool: MockPool = {
      query: jest.fn().mockResolvedValue({
        rows: [
          { date: '2026-01-01', balance_value: '100' },
          { date: '2026-01-02', balance_value: '101.25' },
          { date: '2026-01-03', balance_value: 99.5 },
        ],
      }),
    };
    const repo = new PortfolioHistoryRepository(pool as never);

    const snapshots = await repo.findByUserId('123');

    expect(snapshots).toEqual([
      { date: '2026-01-01', balanceValue: 100 },
      { date: '2026-01-02', balanceValue: 101.25 },
      { date: '2026-01-03', balanceValue: 99.5 },
    ]);
  });

  it('builds trades API query with defaults and filters', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([
        {
          id: 'trade-1',
          type: 'TRADE',
          usdcSize: 12.34,
          outcomeStatus: 'won',
          realizedPnl: 5.5,
        },
      ]),
    } as unknown as Response);

    const configService = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'POLYMARKET_DATA_API_URL') {
          return 'https://data-api.polymarket.com';
        }
        return fallback ?? '';
      }),
    };
    const repo = new PortfolioTradesRepository(configService as never);

    await repo.findByWallet({
      walletAddress: '0x1111111111111111111111111111111111111111',
      period: '30d',
      page: 3,
      per_page: 25,
      limit: 30,
      offset: 0,
      start: 1776191400,
      end: 1776882600,
      excludeDepositsWithdrawals: false,
      market:
        '0xaa47997fba2027b59efd78b32bef2d073f19f1feec236c83754d90d8be39cbea',
      eventId: '12345',
      type: 'TRADE,REDEEM',
      side: 'BUY',
      sort_by: 'created_at',
      sort_dir: 'asc',
      sortBy: 'TIMESTAMP',
      sortDirection: 'DESC',
      outcome: 'YES',
    });

    const url = ((fetchMock.mock.calls[0] as unknown[])[0] as string) ?? '';
    expect(url).toContain('/activity?');
    expect(url).toContain('user=0x1111111111111111111111111111111111111111');
    expect(url).toContain('limit=30');
    expect(url).toContain('offset=0');
    expect(url).toContain('page=3');
    expect(url).toContain('per_page=25');
    expect(url).toContain('period=30d');
    expect(url).toContain('start=1776191400');
    expect(url).toContain('end=1776882600');
    expect(url).toContain('excludeDepositsWithdrawals=false');
    expect(url).toContain(
      'market=0xaa47997fba2027b59efd78b32bef2d073f19f1feec236c83754d90d8be39cbea',
    );
    expect(url).toContain('eventId=12345');
    expect(url).toContain('type=TRADE%2CREDEEM');
    expect(url).toContain('side=BUY');
    expect(url).toContain('sortBy=TIMESTAMP');
    expect(url).toContain('sortDirection=DESC');
    expect(url).toContain('sort_by=created_at');
    expect(url).toContain('sort_dir=asc');
    expect(url).toContain('outcome=YES');
    const payload = await repo.findByWallet({
      walletAddress: '0x1111111111111111111111111111111111111111',
    });
    expect(Array.isArray(payload)).toBe(true);
    const first = payload[0] as Record<string, unknown>;
    expect(first.type).toBe('TRADE');
    expect(first.usdcSize).toBe(12.34);
    expect(typeof first.date).toBe('string');
    expect(typeof first.market).toBe('string');
    expect(typeof first.side).toBe('string');
    expect(first.entry_price).toBeNull();
    expect(first.exit_price).toBeNull();
    expect(typeof first.size).toBe('number');
    expect(first.outcome).toBe('WON');
    expect(first.pnl).toBe(5.5);
    expect(first.venue).toBe('Polymarket');

    fetchMock.mockRestore();
  });

  it('maps legacy sort params to Polymarket activity enums', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([]),
    } as unknown as Response);

    const configService = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'POLYMARKET_DATA_API_URL') {
          return 'https://data-api.polymarket.com';
        }
        return fallback ?? '';
      }),
    };
    const repo = new PortfolioTradesRepository(configService as never);

    await repo.findByWallet({
      walletAddress: '0x1111111111111111111111111111111111111111',
      sort_by: 'created_at',
      sort_dir: 'desc',
    });

    const url = ((fetchMock.mock.calls[0] as unknown[])[0] as string) ?? '';
    expect(url).toContain('sortBy=TIMESTAMP');
    expect(url).toContain('sortDirection=DESC');

    fetchMock.mockRestore();
  });

  it('defaults period to 30d when omitted', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([]),
    } as unknown as Response);

    const configService = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'POLYMARKET_DATA_API_URL') {
          return 'https://data-api.polymarket.com';
        }
        return fallback ?? '';
      }),
    };
    const repo = new PortfolioTradesRepository(configService as never);

    await repo.findByWallet({
      walletAddress: '0x1111111111111111111111111111111111111111',
    });

    const url = ((fetchMock.mock.calls[0] as unknown[])[0] as string) ?? '';
    expect(url).toContain('period=30d');

    fetchMock.mockRestore();
  });

  it('maps pushed outcome from raw outcome string', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([{ id: 'trade-2', outcome: 'voided' }]),
    } as unknown as Response);

    const configService = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'POLYMARKET_DATA_API_URL') {
          return 'https://data-api.polymarket.com';
        }
        return fallback ?? '';
      }),
    };
    const repo = new PortfolioTradesRepository(configService as never);

    const payload = await repo.findByWallet({
      walletAddress: '0x1111111111111111111111111111111111111111',
    });

    expect(payload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'trade-2',
          outcome: 'PUSHED',
        }),
      ]),
    );

    fetchMock.mockRestore();
  });
});
