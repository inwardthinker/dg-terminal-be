import { PolymarketDataService } from '../../src/positions/polymarket-data.service';

describe('PolymarketDataService', () => {
  const resolveInputUrl = (input: RequestInfo | URL): string => {
    if (typeof input === 'string') {
      return input;
    }
    if (input instanceof URL) {
      return input.toString();
    }

    return input.url;
  };

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

  it('enriches open positions with mapped category from event tags', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input: RequestInfo | URL) => {
        const url = resolveInputUrl(input);
        if (url.includes('/positions?')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                { asset: 'a1', size: 2, eventId: '100' },
                { asset: 'a2', size: 1, eventId: '200' },
                { asset: 'a3', size: 1, eventId: '300' },
              ]),
          } as Response);
        }
        if (url.endsWith('/events/100/tags')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ id: '1', label: 'sports' }]),
          } as Response);
        }
        if (url.endsWith('/events/200/tags')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ id: '2', label: 'POLITICS' }]),
          } as Response);
        }
        if (url.endsWith('/events/300/tags')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ id: '3', label: 'unknown' }]),
          } as Response);
        }
        return Promise.reject(new Error(`Unexpected URL ${url}`));
      });

    const service = new PolymarketDataService(mockConfigService as never);
    const result = await service.getOpenPositions(
      '0x798a7921f5b2c684ecbaa7a6ae216a819fa6cc72',
    );

    expect(result).toEqual([
      expect.objectContaining({
        asset: 'a1',
        eventId: '100',
        category: 'Sports',
      }),
      expect.objectContaining({
        asset: 'a2',
        eventId: '200',
        category: 'Politics',
      }),
      expect.objectContaining({
        asset: 'a3',
        eventId: '300',
        category: 'Other',
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('dedupes event ids and falls back to Other when tags API fails', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input: RequestInfo | URL) => {
        const url = resolveInputUrl(input);
        if (url.includes('/positions?')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                { asset: 'a1', size: 2, eventId: '100' },
                { asset: 'a2', size: 1, eventId: '100' },
                { asset: 'a3', size: 1, eventId: '200' },
              ]),
          } as Response);
        }
        if (url.endsWith('/events/100/tags')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ id: '1', label: 'crypto' }]),
          } as Response);
        }
        if (url.endsWith('/events/200/tags')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({}),
          } as Response);
        }

        return Promise.reject(new Error(`Unexpected URL ${url}`));
      });

    const service = new PolymarketDataService(mockConfigService as never);
    const result = await service.getOpenPositions(
      '0x798a7921f5b2c684ecbaa7a6ae216a819fa6cc72',
    );

    expect(result).toEqual([
      expect.objectContaining({
        asset: 'a1',
        eventId: '100',
        category: 'Crypto',
      }),
      expect.objectContaining({
        asset: 'a2',
        eventId: '100',
        category: 'Crypto',
      }),
      expect.objectContaining({
        asset: 'a3',
        eventId: '200',
        category: 'Other',
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reuses cached categories to avoid repeat tag lookups', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input: RequestInfo | URL) => {
        const url = resolveInputUrl(input);
        if (url.includes('/positions?')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([{ asset: 'a1', size: 1, eventId: '100' }]),
          } as Response);
        }
        if (url.endsWith('/events/100/tags')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ id: '1', label: 'sports' }]),
          } as Response);
        }

        return Promise.reject(new Error(`Unexpected URL ${url}`));
      });

    const service = new PolymarketDataService(mockConfigService as never);

    const firstResult = await service.getOpenPositions(
      '0x798a7921f5b2c684ecbaa7a6ae216a819fa6cc72',
    );
    const secondResult = await service.getOpenPositions(
      '0x798a7921f5b2c684ecbaa7a6ae216a819fa6cc72',
    );

    expect(firstResult[0]).toEqual(
      expect.objectContaining({ eventId: '100', category: 'Sports' }),
    );
    expect(secondResult[0]).toEqual(
      expect.objectContaining({ eventId: '100', category: 'Sports' }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
