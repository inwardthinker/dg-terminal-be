import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PolymarketDataService } from '../../src/positions/polymarket-data.service';
import { PolymarketMarketStreamService } from '../../src/positions/polymarket-market-stream.service';
import { PositionsPriceService } from '../../src/positions/positions-price.service';
import { MarketPriceUpdate } from '../../src/positions/positions.types';

describe('PositionsPriceService', () => {
  it('streams prices per position with position_id, current_price, and stale', async () => {
    const mockDataService = {
      getOpenPositions: jest.fn().mockResolvedValue([
        {
          asset: 'asset-1',
          size: 10,
          avgPrice: 0.5,
          initialValue: 5,
        },
      ]),
    };

    let listener: ((update: MarketPriceUpdate) => void) | undefined;

    const subscribeMock = jest
      .fn<() => void, [string[], (update: MarketPriceUpdate) => void]>()
      .mockImplementation((_assetIds, cb) => {
        listener = cb;
        return () => undefined;
      });
    const getLastPriceMock = jest.fn<number | undefined, [string]>();
    getLastPriceMock.mockReturnValue(undefined);

    const mockMarketStream = {
      subscribe: subscribeMock,
      getLastPrice: getLastPriceMock,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionsPriceService,
        { provide: PolymarketDataService, useValue: mockDataService },
        { provide: PolymarketMarketStreamService, useValue: mockMarketStream },
        { provide: ConfigService, useValue: { get: jest.fn(() => '200') } },
      ],
    }).compile();

    const service = moduleRef.get(PositionsPriceService);
    const emitted: Array<{
      position_id: string;
      no_of_shares: number;
      category: string;
      avg_price: number | null;
      current_price: number | null;
      position_value: number | null;
      pnl_amount: number | null;
      pnl_percent: number | null;
      stale: boolean;
    }> = [];

    const unsubscribe = await service.subscribeUser('0x123', (event) => {
      emitted.push(event);
    });

    listener?.({ assetId: 'asset-1', currentPrice: 0.62, stale: false });

    expect(emitted).toEqual([
      {
        position_id: 'asset-1',
        no_of_shares: 10,
        category: 'Other',
        outcome: null,
        title: null,
        avg_price: 0.5,
        current_price: null,
        position_value: null,
        pnl_amount: null,
        pnl_percent: null,
        stale: true,
      },
      {
        position_id: 'asset-1',
        no_of_shares: 10,
        category: 'Other',
        outcome: null,
        title: null,
        avg_price: 0.5,
        current_price: 0.62,
        position_value: 6.2,
        pnl_amount: 1.2000000000000002,
        pnl_percent: 24.000000000000004,
        stale: false,
      },
    ]);
    unsubscribe();
  });

  it('emits stale flag when venue prices are unavailable', async () => {
    const mockDataService = {
      getOpenPositions: jest.fn().mockResolvedValue([
        {
          asset: 'asset-a',
          size: 2,
          curPrice: 0.41,
          currentValue: 0.82,
          cashPnl: -0.18,
          percentPnl: -18,
        },
        {
          asset: 'asset-b',
          size: 4,
          curPrice: 0.25,
          currentValue: 1,
          cashPnl: 0.1,
          percentPnl: 11.1,
        },
      ]),
    };

    let listener: ((update: MarketPriceUpdate) => void) | undefined;

    const subscribeMock = jest
      .fn<() => void, [string[], (update: MarketPriceUpdate) => void]>()
      .mockImplementation((_assetIds, cb) => {
        listener = cb;
        return () => undefined;
      });
    const getLastPriceMock = jest.fn<number | undefined, [string]>();
    getLastPriceMock.mockReturnValue(undefined);

    const mockMarketStream = {
      subscribe: subscribeMock,
      getLastPrice: getLastPriceMock,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionsPriceService,
        { provide: PolymarketDataService, useValue: mockDataService },
        { provide: PolymarketMarketStreamService, useValue: mockMarketStream },
        { provide: ConfigService, useValue: { get: jest.fn(() => '200') } },
      ],
    }).compile();

    const service = moduleRef.get(PositionsPriceService);
    const emitted: Array<{
      position_id: string;
      no_of_shares: number;
      category: string;
      avg_price: number | null;
      current_price: number | null;
      position_value: number | null;
      pnl_amount: number | null;
      pnl_percent: number | null;
      stale: boolean;
    }> = [];

    const unsubscribe = await service.subscribeUser('0x123', (event) => {
      emitted.push(event);
    });

    listener?.({ stale: true });

    expect(emitted).toContainEqual({
      position_id: 'asset-a',
      no_of_shares: 2,
      category: 'Other',
      outcome: null,
      title: null,
      avg_price: null,
      current_price: 0.41,
      position_value: 0.82,
      pnl_amount: -0.18,
      pnl_percent: -18,
      stale: true,
    });
    expect(emitted).toContainEqual({
      position_id: 'asset-b',
      no_of_shares: 4,
      category: 'Other',
      outcome: null,
      title: null,
      avg_price: null,
      current_price: 0.25,
      position_value: 1,
      pnl_amount: 0.1,
      pnl_percent: 11.1,
      stale: true,
    });
    unsubscribe();
  });

  it('dispatches server tick updates fast enough for client 200ms render budget', async () => {
    const mockDataService = {
      getOpenPositions: jest.fn().mockResolvedValue([
        {
          asset: 'asset-latency',
          size: 1,
        },
      ]),
    };

    let listener: ((update: MarketPriceUpdate) => void) | undefined;

    const subscribeMock = jest
      .fn<() => void, [string[], (update: MarketPriceUpdate) => void]>()
      .mockImplementation((_assetIds, cb) => {
        listener = cb;
        return () => undefined;
      });
    const getLastPriceMock = jest.fn<number | undefined, [string]>();
    getLastPriceMock.mockReturnValue(undefined);

    const mockMarketStream = {
      subscribe: subscribeMock,
      getLastPrice: getLastPriceMock,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionsPriceService,
        { provide: PolymarketDataService, useValue: mockDataService },
        { provide: PolymarketMarketStreamService, useValue: mockMarketStream },
        { provide: ConfigService, useValue: { get: jest.fn(() => '200') } },
      ],
    }).compile();

    const service = moduleRef.get(PositionsPriceService);
    const measuredLatenciesMs: number[] = [];
    let startedAt = process.hrtime.bigint();

    const unsubscribe = await service.subscribeUser('0x123', () => {
      measuredLatenciesMs.push(
        Number(process.hrtime.bigint() - startedAt) / 1e6,
      );
    });

    startedAt = process.hrtime.bigint();
    listener?.({ assetId: 'asset-latency', currentPrice: 0.51, stale: false });

    const priceUpdateLatencyMs =
      measuredLatenciesMs[measuredLatenciesMs.length - 1] ?? 999;
    expect(priceUpdateLatencyMs).toBeLessThan(200);
    unsubscribe();
  });

  it('emits periodic snapshots when upstream has no new ticks', async () => {
    jest.useFakeTimers();
    const mockDataService = {
      getOpenPositions: jest.fn().mockResolvedValue([
        {
          asset: 'asset-periodic',
          size: 2,
          avgPrice: 0.5,
          initialValue: 1,
        },
      ]),
    };

    const subscribeMock = jest
      .fn<() => void, [string[], (update: MarketPriceUpdate) => void]>()
      .mockImplementation(() => () => undefined);
    const getLastPriceMock = jest
      .fn<number | undefined, [string]>()
      .mockReturnValue(0.55);

    const mockMarketStream = {
      subscribe: subscribeMock,
      getLastPrice: getLastPriceMock,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionsPriceService,
        { provide: PolymarketDataService, useValue: mockDataService },
        { provide: PolymarketMarketStreamService, useValue: mockMarketStream },
        { provide: ConfigService, useValue: { get: jest.fn(() => '200') } },
      ],
    }).compile();

    const service = moduleRef.get(PositionsPriceService);
    const emitted: Array<{ stale: boolean; current_price: number | null }> = [];

    const unsubscribe = await service.subscribeUser('0x123', (event) => {
      emitted.push({
        stale: event.stale,
        current_price: event.current_price,
      });
    });

    jest.advanceTimersByTime(250);
    await Promise.resolve();

    expect(emitted.some((entry) => entry.stale === false)).toBe(true);
    expect(
      emitted.filter(
        (entry) => entry.stale === false && entry.current_price === 0.55,
      ).length,
    ).toBeGreaterThanOrEqual(2);

    unsubscribe();
    jest.useRealTimers();
  });
});
