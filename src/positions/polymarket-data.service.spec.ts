import { ConfigService } from '@nestjs/config';
import { PolymarketDataService } from './polymarket-data.service';

describe('PolymarketDataService', () => {
  function createService(): PolymarketDataService {
    const configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'POLYMARKET_DATA_API_URL') {
          return 'https://data-api.polymarket.com';
        }
        return defaultValue ?? '';
      }),
    } as unknown as ConfigService;

    return new PolymarketDataService(configService);
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('excludes resolved-lost positions from open positions response', async () => {
    const service = createService();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => [
        { asset: 'a1', size: 10, percentPnl: 25 },
        { asset: 'a2', size: 5, percentPnl: -99 },
        { asset: 'a3', size: 2, percentPnl: -100 },
      ],
    } as Response);

    const result = await service.getOpenPositions(
      '0x798a7921f5b2c684ecbaa7a6ae216a819fa6cc72',
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.asset).toBe('a1');
  });
});
