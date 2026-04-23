import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { GetPortfolioClosedPositionsQueryDto } from './dto/get-portfolio-closed-positions.query.dto';
import { GetPortfolioPositionsQueryDto } from './dto/get-portfolio-positions.query.dto';
import { GetPortfolioSummaryQueryDto } from './dto/get-portfolio-summary.query.dto';
import { GetPortfolioTradesQueryDto } from './dto/get-portfolio-trades.query.dto';
import { PortfolioAuthHeaderGuard } from './guards/portfolio-auth-header.guard';
import { PortfolioService } from './portfolio.service';
import { BalanceSnapshot, HistoryPeriod } from './types/portfolio-history.type';

const VALID_PERIODS = new Set<HistoryPeriod>(['7d', '30d', '90d', 'all']);

@Controller('api/portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get('history')
  getHistory(
    @Query('period') period: string,
    @Query('userId') userId: string,
  ): Promise<BalanceSnapshot[]> {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    if (!period || !VALID_PERIODS.has(period as HistoryPeriod)) {
      throw new BadRequestException(
        `Invalid period. Must be one of: ${[...VALID_PERIODS].join(', ')}`,
      );
    }

    return this.portfolioService.getHistory(userId, period as HistoryPeriod);
  }

  @UseGuards(PortfolioAuthHeaderGuard)
  @Get('positions')
  getPositions(@Query() query: GetPortfolioPositionsQueryDto) {
    return this.portfolioService.getPositions(query);
  }

  @UseGuards(PortfolioAuthHeaderGuard)
  @Get('closed-positions')
  getClosedPositions(@Query() query: GetPortfolioClosedPositionsQueryDto) {
    return this.portfolioService.getClosedPositions(query);
  }

  @UseGuards(PortfolioAuthHeaderGuard)
  @Get('summary')
  getSummary(@Query() query: GetPortfolioSummaryQueryDto) {
    return this.portfolioService.getSummary(query);
  }

  @UseGuards(PortfolioAuthHeaderGuard)
  @Get('trades')
  getTrades(@Query() query: GetPortfolioTradesQueryDto) {
    return this.portfolioService.getTrades(query);
  }
}
