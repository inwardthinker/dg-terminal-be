import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenPosition } from './positions.types';

interface PolymarketPositionResponse {
  asset: string;
  size: number;
  avgPrice?: number;
  currentValue?: number;
  initialValue?: number;
  cashPnl?: number;
  percentPnl?: number;
  totalBought?: number;
  realizedPnl?: number;
  percentRealizedPnl?: number;
  curPrice?: number;
  redeemable?: boolean;
  mergeable?: boolean;
}

@Injectable()
export class PolymarketDataService {
  private readonly logger = new Logger(PolymarketDataService.name);

  constructor(private readonly configService: ConfigService) {}

  async getOpenPositions(userAddress: string): Promise<OpenPosition[]> {
    const baseUrl = this.configService.get<string>(
      'POLYMARKET_DATA_API_URL',
      'https://data-api.polymarket.com',
    );
    const params = new URLSearchParams({
      user: userAddress,
      sizeThreshold: '0',
      limit: '500',
    });

    const authHeaderName = this.configService.get<string>(
      'POLYMARKET_DATA_API_AUTH_HEADER_NAME',
      '',
    );
    const authHeaderValue = this.configService.get<string>(
      'POLYMARKET_DATA_API_AUTH_HEADER_VALUE',
      '',
    );
    const headers =
      authHeaderName && authHeaderValue
        ? { [authHeaderName]: authHeaderValue }
        : undefined;

    const response = await fetch(
      `${baseUrl}/positions?${params.toString()}`,
      headers ? { headers } : undefined,
    );
    if (!response.ok) {
      throw new Error(
        `Polymarket positions request failed: ${response.status}`,
      );
    }

    const payload = (await response.json()) as PolymarketPositionResponse[];
    const openPositions = payload
      .filter((position) => Number(position.size) > 0)
      .map((position) => ({
        asset: position.asset,
        size: Number(position.size),
        avgPrice:
          typeof position.avgPrice === 'number'
            ? Number(position.avgPrice)
            : undefined,
        currentValue:
          typeof position.currentValue === 'number'
            ? Number(position.currentValue)
            : undefined,
        initialValue:
          typeof position.initialValue === 'number'
            ? Number(position.initialValue)
            : undefined,
        cashPnl:
          typeof position.cashPnl === 'number'
            ? Number(position.cashPnl)
            : undefined,
        percentPnl:
          typeof position.percentPnl === 'number'
            ? Number(position.percentPnl)
            : undefined,
        totalBought:
          typeof position.totalBought === 'number'
            ? Number(position.totalBought)
            : undefined,
        realizedPnl:
          typeof position.realizedPnl === 'number'
            ? Number(position.realizedPnl)
            : undefined,
        percentRealizedPnl:
          typeof position.percentRealizedPnl === 'number'
            ? Number(position.percentRealizedPnl)
            : undefined,
        curPrice:
          typeof position.curPrice === 'number'
            ? Number(position.curPrice)
            : undefined,
        redeemable:
          typeof position.redeemable === 'boolean'
            ? position.redeemable
            : undefined,
        mergeable:
          typeof position.mergeable === 'boolean'
            ? position.mergeable
            : undefined,
      }));

    this.logger.log(
      `Fetched ${openPositions.length} open positions for ${userAddress}`,
    );
    openPositions.forEach((position) => {
      this.logger.debug(
        `Fetched position asset=${position.asset}, size=${position.size}, avgPrice=${position.avgPrice ?? 'n/a'}, currentValue=${position.currentValue ?? 'n/a'}, initialValue=${position.initialValue ?? 'n/a'}, cashPnl=${position.cashPnl ?? 'n/a'}, percentPnl=${position.percentPnl ?? 'n/a'}, totalBought=${position.totalBought ?? 'n/a'}, realizedPnl=${position.realizedPnl ?? 'n/a'}, percentRealizedPnl=${position.percentRealizedPnl ?? 'n/a'}, curPrice=${position.curPrice ?? 'n/a'}, redeemable=${position.redeemable ?? 'n/a'}, mergeable=${position.mergeable ?? 'n/a'}`,
      );
    });

    return openPositions;
  }
}
