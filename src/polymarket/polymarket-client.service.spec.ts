import { ConfigService } from '@nestjs/config';
import { PolymarketClientService } from './polymarket-client.service';

const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: string) => {
    const values: Record<string, string> = {
      POLYMARKET_DATA_API_BASE_URL: 'https://data-api.test',
      POLYMARKET_GAMMA_BASE_URL: 'https://gamma-api.test',
    };
    return values[key] ?? defaultValue;
  }),
} as unknown as ConfigService;

const mockFetch = (data: unknown, ok = true) =>
  Promise.resolve({
    ok,
    json: () => Promise.resolve(data),
  } as Response);

function requestUrlToString(url: string | URL | Request): string {
  if (typeof url === 'string') {
    return url;
  }
  if (url instanceof URL) {
    return url.toString();
  }
  return url.url;
}

/** Minimal open position row from Data API (conditionId present, no category). */
const dataApiPosition = (
  conditionId: string,
  slug = '',
  overrides: Record<string, unknown> = {},
) => ({
  conditionId,
  title: `Market ${conditionId}`,
  size: '100',
  avgPrice: '0.5',
  curPrice: '0.6',
  slug,
  ...overrides,
});

describe('PolymarketClientService — extractCategory (nested event objects)', () => {
  let service: PolymarketClientService;

  beforeEach(() => {
    service = new PolymarketClientService(mockConfigService);
  });

  it('extracts category from a nested event object when top-level category is null', () => {
    // Access private method via cast
    const extract = (
      service as unknown as { extractCategory(p: unknown): string | undefined }
    ).extractCategory.bind(service);
    const result = extract({
      conditionId: '0x1',
      category: null,
      event: { category: 'Sports' },
    });
    expect(result).toBe('Sports');
  });

  it('extracts category from a nested event object when top-level category is missing', () => {
    const extract = (
      service as unknown as { extractCategory(p: unknown): string | undefined }
    ).extractCategory.bind(service);
    const result = extract({
      conditionId: '0x1',
      event: { category: 'Politics' },
    });
    expect(result).toBe('Politics');
  });
});

describe('PolymarketClientService — category enrichment', () => {
  let service: PolymarketClientService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new PolymarketClientService(mockConfigService);
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves categories via a single batch Gamma request for multiple positions', async () => {
    fetchSpy
      // Data API
      .mockResolvedValueOnce(
        mockFetch([dataApiPosition('cond-1'), dataApiPosition('cond-2')]),
      )
      // Gamma batch
      .mockResolvedValueOnce(
        mockFetch([
          { conditionId: 'cond-1', category: 'Sports' },
          { conditionId: 'cond-2', category: 'Politics' },
        ]),
      );

    const positions = await service.getOpenPositions('0x' + 'a'.repeat(40));

    const gammaUrls = fetchSpy.mock.calls
      .map(([url]) => requestUrlToString(url as string | URL | Request))
      .filter((url) => url.includes('gamma-api.test'));
    expect(gammaUrls).toHaveLength(1);
    const batchUrl = gammaUrls[0] ?? '';
    expect(batchUrl).toContain('condition_ids=');
    expect(batchUrl).toContain('cond-1');
    expect(batchUrl).toContain('cond-2');

    expect(
      positions.find((p) => p.market_name === 'Market cond-1')?.category,
    ).toBe('Sports');
    expect(
      positions.find((p) => p.market_name === 'Market cond-2')?.category,
    ).toBe('Politics');
  });

  it('falls back to slug lookup when batch does not resolve a category', async () => {
    // Route-aware mock: condition_id paths always return empty; slug path returns Crypto.
    // Current code has NO slug fallback → resolves 'Unknown'. New code → 'Crypto'.
    fetchSpy.mockImplementation((url: string | URL | Request) => {
      const u = requestUrlToString(url);
      if (u.includes('data-api.test')) {
        return Promise.resolve(
          mockFetch([dataApiPosition('cond-unknown', 'my-market-slug')]),
        );
      }
      if (u.includes('slug=my-market-slug')) {
        return Promise.resolve(
          mockFetch([{ slug: 'my-market-slug', category: 'Crypto' }]),
        );
      }
      return Promise.resolve(mockFetch([])); // all condition_id-based Gamma calls → empty
    });

    const positions = await service.getOpenPositions('0x' + 'a'.repeat(40));

    expect(positions[0].category).toBe('Crypto');
  });

  it('does not call Gamma when all positions already have categories from Data API', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockFetch([{ ...dataApiPosition('cond-1'), category: 'Sports' }]),
    );

    await service.getOpenPositions('0x' + 'a'.repeat(40));

    const gammaUrls = fetchSpy.mock.calls
      .map(([url]) => requestUrlToString(url as string | URL | Request))
      .filter((url) => url.includes('gamma-api.test'));
    expect(gammaUrls).toHaveLength(0);
  });

  it('uses in-memory cache and skips Gamma on a second call for the same condition_id', async () => {
    fetchSpy
      // First call: Data API
      .mockResolvedValueOnce(mockFetch([dataApiPosition('cond-cached')]))
      // First call: Gamma batch
      .mockResolvedValueOnce(
        mockFetch([{ conditionId: 'cond-cached', category: 'Finance' }]),
      )
      // Second call: Data API
      .mockResolvedValueOnce(mockFetch([dataApiPosition('cond-cached')]));
    // No third mock — Gamma must NOT be called again

    await service.getOpenPositions('0x' + 'a'.repeat(40));
    const positions = await service.getOpenPositions('0x' + 'a'.repeat(40));

    const gammaUrls = fetchSpy.mock.calls
      .map(([url]) => requestUrlToString(url as string | URL | Request))
      .filter((url) => url.includes('gamma-api.test'));
    expect(gammaUrls).toHaveLength(1); // only on first call
    expect(positions[0].category).toBe('Finance');
  });

  it('uses event_id to query GET /events/{id} when batch returns no category', async () => {
    fetchSpy.mockImplementation((url: string | URL | Request) => {
      const u = requestUrlToString(url);
      if (u.includes('data-api.test')) {
        return Promise.resolve(
          mockFetch([
            { ...dataApiPosition('cond-evt', ''), eventId: 'event-42' },
          ]),
        );
      }
      if (u.includes('/events/event-42')) {
        return Promise.resolve(
          mockFetch({ id: 'event-42', category: 'Finance' }),
        );
      }
      return Promise.resolve(mockFetch([])); // batch and other paths → empty
    });

    const positions = await service.getOpenPositions('0x' + 'a'.repeat(40));
    expect(positions[0].category).toBe('Finance');
  });

  it('uses event_slug (not market slug) when querying the events endpoint', async () => {
    fetchSpy.mockImplementation((url: string | URL | Request) => {
      const u = requestUrlToString(url);
      if (u.includes('data-api.test')) {
        return Promise.resolve(
          mockFetch([
            {
              ...dataApiPosition('cond-eslug', 'market-slug-x'),
              eventSlug: 'event-slug-y',
            },
          ]),
        );
      }
      // Market slug on events endpoint should NOT match
      if (u.includes('/events?slug=event-slug-y')) {
        return Promise.resolve(
          mockFetch([{ slug: 'event-slug-y', category: 'Crypto' }]),
        );
      }
      // Market slug on events endpoint should not be tried
      if (u.includes('/events?slug=market-slug-x')) {
        return Promise.resolve(
          mockFetch([{ slug: 'market-slug-x', category: 'WRONG' }]),
        );
      }
      return Promise.resolve(mockFetch([]));
    });

    const positions = await service.getOpenPositions('0x' + 'a'.repeat(40));
    expect(positions[0].category).toBe('Crypto');
    expect(positions[0].category).not.toBe('WRONG');
  });

  it('falls back to Unknown when neither batch nor slug resolves a category', async () => {
    fetchSpy
      // Data API — no slug on this position
      .mockResolvedValueOnce(mockFetch([dataApiPosition('cond-no-gamma')]))
      // Gamma batch — empty
      .mockResolvedValueOnce(mockFetch([]));
    // no slug fallback call expected

    const positions = await service.getOpenPositions('0x' + 'a'.repeat(40));

    expect(positions[0].category).toBe('Unknown');
  });

  it('applies a timeout signal to all fetch calls', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockFetch([dataApiPosition('cond-timeout')]))
      .mockResolvedValueOnce(
        mockFetch([{ conditionId: 'cond-timeout', category: 'Tech' }]),
      );

    await service.getOpenPositions('0x' + 'a'.repeat(40));

    fetchSpy.mock.calls.forEach(([, options]) => {
      expect((options as RequestInit)?.signal).toBeDefined();
    });
  });
});

describe('PolymarketClientService — performance optimizations', () => {
  let service: PolymarketClientService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new PolymarketClientService(mockConfigService);
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fires all batch chunk requests concurrently rather than sequentially (Opt 1)', async () => {
    // 26 positions → 2 chunks (25 + 1) — forces the for-loop to run twice
    const positions = Array.from({ length: 26 }, (_, i) =>
      dataApiPosition(`cond-${i}`),
    );

    let inflightGammaBatchCalls = 0;
    let peakInflightGammaBatchCalls = 0;

    fetchSpy.mockImplementation((url: string | URL | Request) => {
      const u = requestUrlToString(url);
      if (u.includes('data-api.test')) {
        return Promise.resolve(mockFetch(positions));
      }
      if (u.includes('gamma-api.test') && u.includes('condition_ids=')) {
        inflightGammaBatchCalls++;
        peakInflightGammaBatchCalls = Math.max(
          peakInflightGammaBatchCalls,
          inflightGammaBatchCalls,
        );
        // Decrement AFTER the current microtask so parallel calls all register first
        return Promise.resolve(mockFetch([])).then((result) => {
          inflightGammaBatchCalls--;
          return result;
        });
      }
      return Promise.resolve(mockFetch([]));
    });

    await service.getOpenPositions('0x' + 'a'.repeat(40));

    // Sequential loop: chunk 2 starts only after chunk 1 resolves → peak stays at 1.
    // Parallel Promise.all: both chunks start before either resolves → peak is 2.
    expect(peakInflightGammaBatchCalls).toBe(2);
  });

  it('starts fallback lookups concurrently with batch request (Opt 2)', async () => {
    // Position with event_id — batch returns empty, fallback resolves via /events/{id}
    const positionWithEventId = {
      ...dataApiPosition('cond-par', ''),
      eventId: 'evt-42',
    };

    let batchStarted = false;
    let isBatchResolved = false;
    let fallbackStartedBeforeBatchResolved = false;
    let resolveBatch: (() => void) | null = null;

    fetchSpy.mockImplementation((url: string | URL | Request) => {
      const u = requestUrlToString(url);
      if (u.includes('data-api.test')) {
        return Promise.resolve(mockFetch([positionWithEventId]));
      }
      if (u.includes('condition_ids=')) {
        batchStarted = true;
        return new Promise<Response>((resolve) => {
          resolveBatch = () => {
            isBatchResolved = true;
            resolve({
              ok: true,
              json: () => Promise.resolve([]),
            } as unknown as Response);
          };
        });
      }
      if (u.includes('/events/evt-42')) {
        if (batchStarted && !isBatchResolved) {
          // Fallback fired while batch still in-flight → parallel execution confirmed
          fallbackStartedBeforeBatchResolved = true;
        }
        return Promise.resolve(
          mockFetch({ id: 'evt-42', category: 'Finance' }),
        );
      }
      return Promise.resolve(mockFetch([]));
    });

    const promise = service.getOpenPositions('0x' + 'a'.repeat(40));

    // Flush microtasks to allow any concurrently-initiated fetches to register
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Now unblock the batch
    if (resolveBatch) (resolveBatch as () => void)();

    const positions = await promise;

    expect(fallbackStartedBeforeBatchResolved).toBe(true);
    expect(positions[0]?.category).toBe('Finance');
  });
});
