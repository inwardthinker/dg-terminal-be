import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { PortfolioService } from '../../src/portfolio/portfolio.service';

const mockQuery = jest.fn();
const mockEnd = jest.fn();
const mockRelease = jest.fn();

function getFirstSqlArg(): string {
  const calls = mockQuery.mock.calls as unknown as Array<[string, unknown[]]>;
  return calls[0][0];
}

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: mockQuery,
    end: mockEnd,
    connect: jest.fn().mockResolvedValue({
      query: mockQuery,
      release: mockRelease,
    }),
  })),
}));

function makeConfigService(
  overrides: Record<string, string> = {},
): ConfigService {
  const defaults: Record<string, string> = {
    DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  };
  const merged = { ...defaults, ...overrides };

  return {
    get: jest.fn((key: string) => merged[key]),
    getOrThrow: jest.fn((key: string) => {
      if (!(key in merged)) throw new Error(`Missing config key: ${key}`);
      return merged[key];
    }),
  } as unknown as ConfigService;
}

describe('PortfolioService', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockEnd.mockReset();
    mockRelease.mockReset();
    (Pool as unknown as jest.Mock).mockClear();
  });

  it('creates pg pool with DATABASE_URL', () => {
    const databaseUrl = 'postgres://test-user:test-pass@db:5432/test-db';

    new PortfolioService(makeConfigService({ DATABASE_URL: databaseUrl }));

    expect(Pool).toHaveBeenCalledWith({ connectionString: databaseUrl });
  });

  it('returns daily balance snapshots for the requested period', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { date: '2026-04-08', balance_value: '17690.11' },
        { date: '2026-04-09', balance_value: '17705.42' },
        { date: '2026-04-10', balance_value: '17733.00' },
        { date: '2026-04-11', balance_value: '17720.50' },
      ],
    });

    const service = new PortfolioService(makeConfigService());
    const result = await service.getHistory('1878', '7d');

    expect(result).toEqual([
      { date: '2026-04-08', balance_value: 17690.11 },
      { date: '2026-04-09', balance_value: 17705.42 },
      { date: '2026-04-10', balance_value: 17733 },
      { date: '2026-04-11', balance_value: 17720.5 },
    ]);
    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['1878', '7d']);
  });

  it('returns empty array when fewer than 3 points are returned', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { date: '2026-04-08', balance_value: '17690.11' },
        { date: '2026-04-09', balance_value: '17705.42' },
      ],
    });

    const service = new PortfolioService(makeConfigService());
    const result = await service.getHistory('1878', '30d');

    expect(result).toEqual([]);
  });

  it('returns empty array when no rows exist for user', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const service = new PortfolioService(makeConfigService());
    const result = await service.getHistory('9999', 'all');

    expect(result).toEqual([]);
  });

  it('filters out null balance rows from query output', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { date: '2026-04-08', balance_value: null },
        { date: '2026-04-09', balance_value: '100.00' },
        { date: '2026-04-10', balance_value: '120.00' },
        { date: '2026-04-11', balance_value: '140.00' },
      ],
    });

    const service = new PortfolioService(makeConfigService());
    const result = await service.getHistory('1878', '7d');

    expect(result).toEqual([
      { date: '2026-04-09', balance_value: 100 },
      { date: '2026-04-10', balance_value: 120 },
      { date: '2026-04-11', balance_value: 140 },
    ]);
  });

  it('supports all period in query params', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { date: '2026-01-01', balance_value: '100.00' },
        { date: '2026-01-02', balance_value: '101.00' },
        { date: '2026-01-03', balance_value: '102.00' },
      ],
    });

    const service = new PortfolioService(makeConfigService());
    await service.getHistory('42', 'all');

    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['42', 'all']);
  });

  it('uses SQL with generate_series to fill missing dates', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { date: '2026-04-08', balance_value: '100.00' },
        { date: '2026-04-09', balance_value: '100.00' },
        { date: '2026-04-10', balance_value: '120.00' },
      ],
    });

    const service = new PortfolioService(makeConfigService());
    await service.getHistory('1878', '7d');

    const sql = getFirstSqlArg();
    expect(sql).toContain('generate_series');
    expect(sql).toContain('WHERE r.snapshot_date <= s.date');
  });

  it('uses latest snapshot as period anchor for 7d/30d/90d', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { date: '2026-04-01', balance_value: '100.00' },
        { date: '2026-04-02', balance_value: '101.00' },
        { date: '2026-04-03', balance_value: '102.00' },
      ],
    });

    const service = new PortfolioService(makeConfigService());
    await service.getHistory('1878', '90d');

    const sql = getFirstSqlArg();
    expect(sql).toContain('SELECT MAX(snapshot_date) AS max_date');
    expect(sql).toContain("WHEN $2::text = '90d' THEN INTERVAL '89 days'");
  });

  it('logs and throws when DB query fails', async () => {
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    mockQuery.mockRejectedValue(new Error('connection lost'));

    const service = new PortfolioService(makeConfigService());

    await expect(service.getHistory('1878', '7d')).rejects.toThrow(
      'connection lost',
    );
    expect(loggerSpy).toHaveBeenCalled();
  });

  it('closes pg pool on module destroy', async () => {
    const service = new PortfolioService(makeConfigService());

    await service.onModuleDestroy();

    expect(mockEnd).toHaveBeenCalledTimes(1);
  });

  it('fully closes a position and returns realized_pnl + closed_at', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            proxy_wallet: '0xabc',
            market_name: 'Will BTC hit 100k',
            side: 'YES',
            venue: 'Polymarket',
            category: 'Crypto',
            shares: '100',
            avg_entry_price: '0.4',
            current_price: '0.7',
            cost_basis: '40',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const service = new PortfolioService(makeConfigService());
    const result = await service.closePosition('1878', 'asset-1', {
      type: 'full',
    });

    expect(result.realized_pnl).toBe(30);
    expect(result.closed_at).toBeDefined();
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM silver_dgterminal.positions'),
      ['1878', 'asset-1'],
    );
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining(
        'INSERT INTO silver_dgterminal.portfolio_summary',
      ),
      expect.any(Array),
    );
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO silver_dgterminal.trade_history'),
      expect.any(Array),
    );
  });

  it('partially closes a position and returns remaining_size + avg_entry_price', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            proxy_wallet: '0xabc',
            market_name: 'Will BTC hit 100k',
            side: 'YES',
            venue: 'Polymarket',
            category: 'Crypto',
            shares: '100',
            avg_entry_price: '0.4',
            current_price: '0.7',
            cost_basis: '40',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const service = new PortfolioService(makeConfigService());
    const result = await service.closePosition('1878', 'asset-1', {
      type: 'partial',
      percentage: 25,
    });

    expect(result).toEqual({
      realized_pnl: 7.5,
      remaining_size: 75,
      avg_entry_price: 0.4,
    });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE silver_dgterminal.positions'),
      ['75', '30', '0.4', '1878', 'asset-1'],
    );
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining(
        'INSERT INTO silver_dgterminal.portfolio_summary',
      ),
      expect.any(Array),
    );
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO silver_dgterminal.trade_history'),
      expect.any(Array),
    );
  });

  it('throws not found when position does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const service = new PortfolioService(makeConfigService());

    await expect(
      service.closePosition('1878', 'missing', { type: 'full' }),
    ).rejects.toThrow('Position not found');
  });

  it('throws conflict when position is already closed', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          proxy_wallet: '0xabc',
          market_name: 'Will BTC hit 100k',
          side: 'YES',
          venue: 'Polymarket',
          category: 'Crypto',
          shares: '0',
          avg_entry_price: '0.4',
          current_price: '0.7',
          cost_basis: '0',
        },
      ],
    });
    const service = new PortfolioService(makeConfigService());

    await expect(
      service.closePosition('1878', 'asset-1', { type: 'full' }),
    ).rejects.toThrow('Position is already closed');
  });
});
