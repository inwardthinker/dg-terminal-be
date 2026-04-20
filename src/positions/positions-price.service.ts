import { Injectable, Logger } from '@nestjs/common';
import { PolymarketDataService } from './polymarket-data.service';
import { PolymarketMarketStreamService } from './polymarket-market-stream.service';
import { OpenPosition, PositionPriceEvent } from './positions.types';

type PriceEmitFn = (event: PositionPriceEvent) => void;

@Injectable()
export class PositionsPriceService {
  private readonly logger = new Logger(PositionsPriceService.name);

  constructor(
    private readonly polymarketDataService: PolymarketDataService,
    private readonly polymarketMarketStreamService: PolymarketMarketStreamService,
  ) {}

  async subscribeUser(
    userAddress: string,
    emit: PriceEmitFn,
  ): Promise<() => void> {
    const openPositions =
      await this.polymarketDataService.getOpenPositions(userAddress);
    if (openPositions.length === 0) {
      this.logger.log(`No open positions for user ${userAddress}`);
      return () => undefined;
    }

    this.logger.log(
      `Streaming prices for ${openPositions.length} open positions of user ${userAddress}`,
    );

    this.emitInitialSnapshot(openPositions, emit);

    const openPositionsByAsset = new Map<string, OpenPosition>();
    openPositions.forEach((position) => {
      openPositionsByAsset.set(position.asset, position);
    });

    return this.polymarketMarketStreamService.subscribe(
      [...openPositionsByAsset.keys()],
      (update) => {
        if (update.stale) {
          this.logger.warn(
            `Venue prices unavailable; emitting stale flag for ${openPositions.length} positions`,
          );
          openPositions.forEach((position) => {
            emit({
              position_id: position.asset,
              outcome: position.outcome ?? null,
              title: position.title ?? null,
              avg_price:
                typeof position.avgPrice === 'number'
                  ? position.avgPrice
                  : null,
              current_price: null,
              position_value: null,
              pnl_amount: null,
              pnl_percent: null,
              stale: true,
            });
          });
          return;
        }

        if (!update.assetId || typeof update.currentPrice !== 'number') {
          return;
        }

        const position = openPositionsByAsset.get(update.assetId);
        if (!position) {
          return;
        }

        emit(this.buildPositionEvent(position, update.currentPrice, false));
        this.logger.debug(
          `Streamed position price: position_id=${position.asset}, avg_price=${position.avgPrice ?? 'n/a'}, current_price=${update.currentPrice}, position_value=${(update.currentPrice * position.size).toFixed(6)}, stale=false`,
        );
      },
    );
  }

  private emitInitialSnapshot(
    openPositions: OpenPosition[],
    emit: PriceEmitFn,
  ): void {
    openPositions.forEach((position) => {
      const cachedPrice = this.polymarketMarketStreamService.getLastPrice(
        position.asset,
      );
      const hasPrice = typeof cachedPrice === 'number';
      emit(
        this.buildPositionEvent(
          position,
          hasPrice ? cachedPrice : null,
          !hasPrice,
        ),
      );
      this.logger.debug(
        `Initial position snapshot: position_id=${position.asset}, current_price=${cachedPrice ?? 'null'}, stale=${typeof cachedPrice !== 'number'}`,
      );
    });
  }

  private buildPositionEvent(
    position: OpenPosition,
    currentPrice: number | null,
    stale: boolean,
  ): PositionPriceEvent {
    if (stale || currentPrice === null) {
      return {
        position_id: position.asset,
        outcome: position.outcome ?? null,
        title: position.title ?? null,
        avg_price:
          typeof position.avgPrice === 'number' ? position.avgPrice : null,
        current_price: null,
        position_value: null,
        pnl_amount: null,
        pnl_percent: null,
        stale: true,
      };
    }

    const positionValue = currentPrice * position.size;
    const costBasis = this.resolveCostBasis(position);
    const pnl =
      typeof costBasis === 'number' ? positionValue - costBasis : null;
    const percentPnl =
      typeof pnl === 'number' &&
      typeof costBasis === 'number' &&
      costBasis !== 0
        ? (pnl / costBasis) * 100
        : null;

    return {
      position_id: position.asset,
      outcome: position.outcome ?? null,
      title: position.title ?? null,
      avg_price:
        typeof position.avgPrice === 'number' ? position.avgPrice : null,
      current_price: currentPrice,
      position_value: positionValue,
      pnl_amount: pnl,
      pnl_percent: percentPnl,
      stale: false,
    };
  }

  private resolveCostBasis(position: OpenPosition): number | undefined {
    if (typeof position.initialValue === 'number') {
      return position.initialValue;
    }

    if (typeof position.avgPrice === 'number') {
      return position.avgPrice * position.size;
    }

    return undefined;
  }
}
