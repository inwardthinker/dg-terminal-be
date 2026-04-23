import { ConfigService } from '@nestjs/config';
import { PortfolioService } from './portfolio.service';

describe('PortfolioService open positions summary', () => {
  function buildService() {
    const config = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'DATABASE_URL') {
          return 'postgresql://user:pass@localhost:5432/testdb';
        }
        if (key === 'POLYMARKET_DATA_API_URL') {
          return 'https://data-api.polymarket.com';
        }
        return defaultValue ?? '';
      }),
      getOrThrow: jest.fn((key: string) => {
        if (key === 'DATABASE_URL') {
          return 'postgresql://user:pass@localhost:5432/testdb';
        }
        throw new Error(`Missing key ${key}`);
      }),
    } as unknown as ConfigService;

    return new PortfolioService(config);
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('computes open positions summary from polymarket positions payload', async () => {
    const service = buildService();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => [
        { size: 10, curPrice: 0.5, cashPnl: 3 },
        { size: 5, curPrice: 0.8, cashPnl: -1 },
        { size: 2, currentValue: 6, cashPnl: 2.5 },
      ],
    } as Response);

    const result = await service.getOpenPositionsSummary(
      '0x798a7921f5b2c684ecbaa7a6ae216a819fa6cc72',
    );

    expect(result).toEqual({
      open_positions: 3,
      total_exposure: 15,
      largest_position: 6,
      unrealized_pnl: 4.5,
    });
  });

  it('returns zeroed summary when upstream positions fetch fails', async () => {
    const service = buildService();
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network error'));

    const result = await service.getOpenPositionsSummary(
      '0x798a7921f5b2c684ecbaa7a6ae216a819fa6cc72',
    );

    expect(result).toEqual({
      open_positions: 0,
      total_exposure: 0,
      largest_position: 0,
      unrealized_pnl: 0,
    });
  });
});
