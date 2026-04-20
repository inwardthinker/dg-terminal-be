import { PolymarketDataService } from '../../src/positions/polymarket-data.service';

describe('PolymarketDataService', () => {
  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      if (key === 'POLYMARKET_DATA_API_URL') {
        return 'https://data-api.polymarket.com';
      }
      return defaultValue;
    }),
  };

  afterEach(() => {
    jest.restoreAllMocks();
    mockConfigService.get.mockClear();
  });

  it('returns only open positions with positive size', async () => {
    const futureIso = new Date(Date.now() + 60_000).toISOString();
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          { asset: 'a1', size: 2, endDate: futureIso },
          { asset: 'a2', size: 0, endDate: futureIso },
          { asset: 'a3', size: -3, endDate: futureIso },
        ]),
    } as Response);

    const service = new PolymarketDataService(mockConfigService as never);
    const result = await service.getOpenPositions(
      '0x798a7921f5b2c684ecbaa7a6ae216a819fa6cc72',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      expect.objectContaining({ asset: 'a1', size: 2, endDate: futureIso }),
    ]);
  });

  it('throws when polymarket returns a non-200 response', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    } as Response);

    const service = new PolymarketDataService(mockConfigService as never);

    await expect(
      service.getOpenPositions('0x798a7921f5b2c684ecbaa7a6ae216a819fa6cc72'),
    ).rejects.toThrow('Polymarket positions request failed: 500');
  });

  it('keeps positive-size positions regardless of endDate', async () => {
    const now = Date.now();
    const futureIso = new Date(now + 60_000).toISOString();
    const pastIso = new Date(now - 60_000).toISOString();

    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          { asset: 'future-1', size: 1, endDate: futureIso },
          { asset: 'past-1', size: 1, endDate: pastIso },
        ]),
    } as Response);

    const service = new PolymarketDataService(mockConfigService as never);
    const result = await service.getOpenPositions(
      '0x798a7921f5b2c684ecbaa7a6ae216a819fa6cc72',
    );

    expect(result).toHaveLength(2);
    expect(result).toEqual([
      expect.objectContaining({
        asset: 'future-1',
        size: 1,
        endDate: futureIso,
      }),
      expect.objectContaining({
        asset: 'past-1',
        size: 1,
        endDate: pastIso,
      }),
    ]);
  });
});
