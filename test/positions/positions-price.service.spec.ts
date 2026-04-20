import { Test } from '@nestjs/testing';
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

    let listener:
      | ((update: {
          assetId?: string;
          currentPrice?: number;
          stale: boolean;
        }) => void)
      | null = null;

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
      ],
    }).compile();

    const service = moduleRef.get(PositionsPriceService);
    const emitted: Array<{
      position_id: string;
      avg_price: number | null;
      current_price: number | null;
      position_value: number | null;
      pnl_amount: number | null;
      pnl_percent: number | null;
      stale: boolean;
    }> = [];

    await service.subscribeUser('0x123', (event) => {
      emitted.push(event);
    });

    listener?.({ assetId: 'asset-1', currentPrice: 0.62, stale: false });

    expect(emitted).toEqual([
      {
        position_id: 'asset-1',
        avg_price: 0.5,
        current_price: null,
        position_value: null,
        pnl_amount: null,
        pnl_percent: null,
        stale: true,
      },
      {
        position_id: 'asset-1',
        avg_price: 0.5,
        current_price: 0.62,
        position_value: 6.2,
        pnl_amount: 1.2000000000000002,
        pnl_percent: 24.000000000000004,
        stale: false,
      },
    ]);
  });

  it('emits stale flag when venue prices are unavailable', async () => {
    const mockDataService = {
      getOpenPositions: jest.fn().mockResolvedValue([
        {
          asset: 'asset-a',
          size: 2,
        },
        {
          asset: 'asset-b',
          size: 4,
        },
      ]),
    };

    let listener:
      | ((update: {
          assetId?: string;
          currentPrice?: number;
          stale: boolean;
        }) => void)
      | null = null;

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
      ],
    }).compile();

    const service = moduleRef.get(PositionsPriceService);
    const emitted: Array<{
      position_id: string;
      avg_price: number | null;
      current_price: number | null;
      position_value: number | null;
      pnl_amount: number | null;
      pnl_percent: number | null;
      stale: boolean;
    }> = [];

    await service.subscribeUser('0x123', (event) => {
      emitted.push(event);
    });

    listener?.({ stale: true });

    expect(emitted).toContainEqual({
      position_id: 'asset-a',
      avg_price: null,
      current_price: null,
      position_value: null,
      pnl_amount: null,
      pnl_percent: null,
      stale: true,
    });
    expect(emitted).toContainEqual({
      position_id: 'asset-b',
      avg_price: null,
      current_price: null,
      position_value: null,
      pnl_amount: null,
      pnl_percent: null,
      stale: true,
    });
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

    let listener:
      | ((update: {
          assetId?: string;
          currentPrice?: number;
          stale: boolean;
        }) => void)
      | null = null;

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
      ],
    }).compile();

    const service = moduleRef.get(PositionsPriceService);
    const measuredLatenciesMs: number[] = [];
    let startedAt = process.hrtime.bigint();

    await service.subscribeUser('0x123', () => {
      measuredLatenciesMs.push(
        Number(process.hrtime.bigint() - startedAt) / 1e6,
      );
    });

    startedAt = process.hrtime.bigint();
    listener?.({ assetId: 'asset-latency', currentPrice: 0.51, stale: false });

    const priceUpdateLatencyMs =
      measuredLatenciesMs[measuredLatenciesMs.length - 1] ?? 999;
    expect(priceUpdateLatencyMs).toBeLessThan(200);
  });
});
