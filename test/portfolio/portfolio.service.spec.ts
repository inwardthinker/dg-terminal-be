import { ConfigService } from '@nestjs/config';
import { PortfolioService } from '../../src/portfolio/portfolio.service';
import { EquityCurveResponse } from '../../src/portfolio/portfolio.types';

function makeConfigService(
  overrides: Record<string, string> = {},
): ConfigService {
  const defaults: Record<string, string> = {
    EQUITY_CURVE_API_URL: 'https://api.test/v1/equity/curve',
    TOTP_CODE: '123456',
    TOTP_TIMESTAMP: '1776172800',
  };
  const merged = { ...defaults, ...overrides };

  return {
    getOrThrow: jest.fn((key: string) => {
      if (!(key in merged)) throw new Error(`Missing config key: ${key}`);
      return merged[key];
    }),
  } as unknown as ConfigService;
}

function makeCurveResponse(
  points: { date: string; balanceValue: number; dailyChange: number }[],
  rangeOverrides: Partial<
    Record<
      string,
      {
        pointsCount?: number;
        startIndex?: number;
        endIndex?: number;
        insufficientHistory?: boolean;
      }
    >
  > = {},
): EquityCurveResponse {
  const defaultRange = {
    startIndex: 0,
    endIndex: points.length - 1,
    pointsCount: points.length,
    insufficientHistory: false,
  };

  return {
    userId: 1878,
    asOfDate: '2026-04-14',
    points,
    ranges: {
      '7d': { ...defaultRange, ...rangeOverrides['7d'] },
      '30d': { ...defaultRange, ...rangeOverrides['30d'] },
      '90d': { ...defaultRange, ...rangeOverrides['90d'] },
      all: { ...defaultRange, ...rangeOverrides['all'] },
    },
  };
}

function mockFetch(body: EquityCurveResponse) {
  return jest.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
  } as Response);
}

describe('PortfolioService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns daily balance snapshots for the requested period', async () => {
    const curve = makeCurveResponse([
      { date: '2026-04-08', balanceValue: 17690.11, dailyChange: 0 },
      { date: '2026-04-09', balanceValue: 17705.42, dailyChange: 15.31 },
      { date: '2026-04-10', balanceValue: 17733.0, dailyChange: 27.58 },
      { date: '2026-04-11', balanceValue: 17720.5, dailyChange: -12.5 },
    ]);
    mockFetch(curve);

    const service = new PortfolioService(makeConfigService());
    const result = await service.getHistory('1878', '7d');

    expect(result).toEqual([
      { date: '2026-04-08', balance_value: 17690.11 },
      { date: '2026-04-09', balance_value: 17705.42 },
      { date: '2026-04-10', balance_value: 17733.0 },
      { date: '2026-04-11', balance_value: 17720.5 },
    ]);
  });

  it('returns empty array when fewer than 3 data points', async () => {
    const curve = makeCurveResponse([
      { date: '2026-04-08', balanceValue: 17690.11, dailyChange: 0 },
      { date: '2026-04-09', balanceValue: 17705.42, dailyChange: 15.31 },
    ]);
    mockFetch(curve);

    const service = new PortfolioService(makeConfigService());
    const result = await service.getHistory('1878', '7d');

    expect(result).toEqual([]);
  });

  it('returns empty array when range is missing from response', async () => {
    const curve: EquityCurveResponse = {
      userId: 1878,
      asOfDate: '2026-04-14',
      points: [
        { date: '2026-04-08', balanceValue: 17690.11, dailyChange: 0 },
        { date: '2026-04-09', balanceValue: 17705.42, dailyChange: 15.31 },
        { date: '2026-04-10', balanceValue: 17733.0, dailyChange: 27.58 },
      ],
      ranges: {},
    };
    mockFetch(curve);

    const service = new PortfolioService(makeConfigService());
    const result = await service.getHistory('1878', '30d');

    expect(result).toEqual([]);
  });

  it('fills gaps for no-activity days with last known balance', async () => {
    const curve = makeCurveResponse([
      { date: '2026-04-08', balanceValue: 100.0, dailyChange: 0 },
      { date: '2026-04-10', balanceValue: 120.0, dailyChange: 20 },
      { date: '2026-04-13', balanceValue: 150.0, dailyChange: 30 },
    ]);
    mockFetch(curve);

    const service = new PortfolioService(makeConfigService());
    const result = await service.getHistory('1878', '7d');

    expect(result).toEqual([
      { date: '2026-04-08', balance_value: 100.0 },
      { date: '2026-04-09', balance_value: 100.0 },
      { date: '2026-04-10', balance_value: 120.0 },
      { date: '2026-04-11', balance_value: 120.0 },
      { date: '2026-04-12', balance_value: 120.0 },
      { date: '2026-04-13', balance_value: 150.0 },
    ]);
  });

  it('slices points by range startIndex and endIndex', async () => {
    const points = [
      { date: '2026-04-01', balanceValue: 100.0, dailyChange: 0 },
      { date: '2026-04-02', balanceValue: 110.0, dailyChange: 10 },
      { date: '2026-04-03', balanceValue: 120.0, dailyChange: 10 },
      { date: '2026-04-04', balanceValue: 130.0, dailyChange: 10 },
      { date: '2026-04-05', balanceValue: 140.0, dailyChange: 10 },
    ];
    const curve = makeCurveResponse(points, {
      '7d': { startIndex: 2, endIndex: 4, pointsCount: 3 },
    });
    mockFetch(curve);

    const service = new PortfolioService(makeConfigService());
    const result = await service.getHistory('1878', '7d');

    expect(result).toEqual([
      { date: '2026-04-03', balance_value: 120.0 },
      { date: '2026-04-04', balance_value: 130.0 },
      { date: '2026-04-05', balance_value: 140.0 },
    ]);
  });

  it('passes correct URL and auth headers to fetch', async () => {
    const curve = makeCurveResponse([
      { date: '2026-04-08', balanceValue: 100, dailyChange: 0 },
      { date: '2026-04-09', balanceValue: 110, dailyChange: 10 },
      { date: '2026-04-10', balanceValue: 120, dailyChange: 10 },
    ]);
    const fetchMock = mockFetch(curve);

    const service = new PortfolioService(
      makeConfigService({
        EQUITY_CURVE_API_URL: 'https://my-vm/v1/equity/curve',
        TOTP_CODE: 'abc',
        TOTP_TIMESTAMP: '999',
      }),
    );
    await service.getHistory('42', '7d');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://my-vm/v1/equity/curve?userId=42',
      {
        headers: {
          'X-TOTP-Code': 'abc',
          'X-TOTP-Timestamp': '999',
          Accept: 'application/json',
        },
      },
    );
  });

  it('throws when upstream API returns non-200', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({}),
    } as Response);

    const service = new PortfolioService(makeConfigService());

    await expect(service.getHistory('1878', '7d')).rejects.toThrow(
      'Equity curve request failed: 503',
    );
  });

  it('works with "all" period', async () => {
    const curve = makeCurveResponse(
      [
        { date: '2026-04-08', balanceValue: 100, dailyChange: 0 },
        { date: '2026-04-09', balanceValue: 110, dailyChange: 10 },
        { date: '2026-04-10', balanceValue: 120, dailyChange: 10 },
        { date: '2026-04-11', balanceValue: 130, dailyChange: 10 },
      ],
      { all: { startIndex: 0, endIndex: 3, pointsCount: 4 } },
    );
    mockFetch(curve);

    const service = new PortfolioService(makeConfigService());
    const result = await service.getHistory('1878', 'all');

    expect(result).toHaveLength(4);
    expect(result[0].date).toBe('2026-04-08');
    expect(result[3].date).toBe('2026-04-11');
  });
});
