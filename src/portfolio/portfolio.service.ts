import { Injectable } from '@nestjs/common';
import { GetPortfolioClosedPositionsQueryDto } from './dto/get-portfolio-closed-positions.query.dto';
import { GetPortfolioPositionsQueryDto } from './dto/get-portfolio-positions.query.dto';
import { GetPortfolioSummaryQueryDto } from './dto/get-portfolio-summary.query.dto';
import { GetPortfolioTradesQueryDto } from './dto/get-portfolio-trades.query.dto';
import { PortfolioSummaryResponseDto } from './dto/portfolio-summary.response.dto';
import { PortfolioClosedPositionsRepository } from './repositories/portfolio-closed-positions.repository';
import { PortfolioPositionsRepository } from './repositories/portfolio-positions.repository';
import { PortfolioSummaryRepository } from './repositories/portfolio-summary.repository';
import { PortfolioTradesRepository } from './repositories/portfolio-trades.repository';
import { PortfolioClosedPosition } from './types/portfolio-closed-position.type';
import { PortfolioPosition } from './types/portfolio-position.type';
import { PortfolioTrades } from './types/portfolio-trades.type';

@Injectable()
export class PortfolioService {
  constructor(
    private readonly positionsRepository: PortfolioPositionsRepository,
    private readonly closedPositionsRepository: PortfolioClosedPositionsRepository,
    private readonly summaryRepository: PortfolioSummaryRepository,
    private readonly tradesRepository: PortfolioTradesRepository,
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

  async getSummary(query: GetPortfolioSummaryQueryDto): Promise<{
    summary: PortfolioSummaryResponseDto;
  }> {
    try {
      const summary = await this.summaryRepository.findByWallet(
        query.safe_wallet_address,
      );
      return {
        summary: summary ?? {
          balance: 0,
          open_exposure: 0,
          unrealized_pnl: 0,
          realized_30d: 0,
          rewards_earned: 0,
          rewards_pct_of_pnl: null,
          deployment_rate_pct: null,
          balance_last_updated: null,
          open_exposure_last_updated: null,
          unrealized_pnl_last_updated: null,
          realized_30d_last_updated: null,
          rewards_last_updated: null,
        },
      };
    } catch {
      return {
        summary: {
          balance: 0,
          open_exposure: 0,
          unrealized_pnl: 0,
          realized_30d: 0,
          rewards_earned: 0,
          rewards_pct_of_pnl: null,
          deployment_rate_pct: null,
          balance_last_updated: null,
          open_exposure_last_updated: null,
          unrealized_pnl_last_updated: null,
          realized_30d_last_updated: null,
          rewards_last_updated: null,
        },
      };
    }
  }

  async getTrades(query: GetPortfolioTradesQueryDto): Promise<{
    trades: PortfolioTrades;
  }> {
    try {
      return { trades: await this.tradesRepository.findByWallet(query) };
    } catch {
      return { trades: [] };
    }
  }
}
