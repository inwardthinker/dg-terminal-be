import { Injectable } from '@nestjs/common';
import { PolymarketClientService } from '../polymarket/polymarket-client.service';
import { GetPortfolioClosedPositionsQueryDto } from './dto/get-portfolio-closed-positions.query.dto';
import { GetPortfolioPositionsQueryDto } from './dto/get-portfolio-positions.query.dto';
import { PortfolioClosedPosition } from './types/portfolio-closed-position.type';
import { PortfolioPosition } from './types/portfolio-position.type';
import { sortClosedPortfolioPositions } from './utils/sort-closed-positions.util';
import { sortPortfolioPositions } from './utils/sort-positions.util';

@Injectable()
export class PortfolioService {
  constructor(
    private readonly polymarketClientService: PolymarketClientService,
  ) {}

  async getPositions(query: GetPortfolioPositionsQueryDto): Promise<{
    positions: PortfolioPosition[];
  }> {
    const openPositions = await this.polymarketClientService.getOpenPositions(
      query.wallet,
    );
    return { positions: sortPortfolioPositions(openPositions, query) };
  }

  async getClosedPositions(
    query: GetPortfolioClosedPositionsQueryDto,
  ): Promise<{
    closed_positions: PortfolioClosedPosition[];
  }> {
    const limit = query.limit ?? 30;
    const offset = query.offset ?? 0;
    const closed = await this.polymarketClientService.getClosedPositions(
      query.wallet,
      { limit, offset },
    );
    return {
      closed_positions: sortClosedPortfolioPositions(closed, query),
    };
  }
}
