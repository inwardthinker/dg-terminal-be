import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { PortfolioService } from './portfolio.service';
import { BalanceSnapshot, HistoryPeriod } from './portfolio.types';

const VALID_PERIODS = new Set<HistoryPeriod>(['7d', '30d', '90d', 'all']);

@Controller('api/portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get('history')
  async getHistory(
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
}
