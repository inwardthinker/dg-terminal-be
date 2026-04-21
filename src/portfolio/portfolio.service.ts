import { Injectable } from '@nestjs/common';
import { GetPortfolioClosedPositionsQueryDto } from './dto/get-portfolio-closed-positions.query.dto';
import { GetPortfolioPositionsQueryDto } from './dto/get-portfolio-positions.query.dto';
import { PortfolioClosedPositionsRepository } from './repositories/portfolio-closed-positions.repository';
import { PortfolioPositionsRepository } from './repositories/portfolio-positions.repository';
import { PortfolioClosedPosition } from './types/portfolio-closed-position.type';
import { PortfolioPosition } from './types/portfolio-position.type';

@Injectable()
export class PortfolioService {
  constructor(
    private readonly positionsRepository: PortfolioPositionsRepository,
    private readonly closedPositionsRepository: PortfolioClosedPositionsRepository,
  ) {}

  async getPositions(query: GetPortfolioPositionsQueryDto): Promise<{
    positions: PortfolioPosition[];
  }> {
    try {
      const positions = await this.positionsRepository.findByWallet(query);
      return { positions };
    } catch {
      return { positions: [] };
    }
  }

  async getClosedPositions(
    query: GetPortfolioClosedPositionsQueryDto,
  ): Promise<{
    closed_positions: PortfolioClosedPosition[];
  }> {
    try {
      return {
        closed_positions:
          await this.closedPositionsRepository.findByWallet(query),
      };
    } catch {
      return { closed_positions: [] };
    }
  }
}
