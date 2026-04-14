import { Module } from '@nestjs/common';
import { PolymarketDataService } from './polymarket-data.service';
import { PolymarketMarketStreamService } from './polymarket-market-stream.service';
import { PositionsGateway } from './positions.gateway';
import { PositionsPriceService } from './positions-price.service';

@Module({
  providers: [
    PositionsGateway,
    PositionsPriceService,
    PolymarketDataService,
    PolymarketMarketStreamService,
  ],
})
export class PositionsModule {}
