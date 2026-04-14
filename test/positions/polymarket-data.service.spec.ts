import { PolymarketDataService } from '../../src/positions/polymarket-data.service';

describe('PolymarketDataService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns only open positions with positive size', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          { asset: 'a1', size: 2 },
          { asset: 'a2', size: 0 },
          { asset: 'a3', size: -3 },
        ]),
    } as Response);

    const service = new PolymarketDataService();
    const result = await service.getOpenPositions(
      '0x798a7921f5b2c684ecbaa7a6ae216a819fa6cc72',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ asset: 'a1', size: 2 }]);
  });

  it('throws when polymarket returns a non-200 response', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    } as Response);

    const service = new PolymarketDataService();

    await expect(
      service.getOpenPositions('0x798a7921f5b2c684ecbaa7a6ae216a819fa6cc72'),
    ).rejects.toThrow('Polymarket positions request failed: 500');
  });
});
