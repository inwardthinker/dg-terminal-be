import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { PortfolioService } from './portfolio.service';
import {
  BalanceSnapshot,
  ClosePositionResult,
  HistoryPeriod,
} from './portfolio.types';
import { ClosePositionDto } from './dto/close-position.dto';

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

  @Post('positions/:id/close')
  async closePosition(
    @Param('id') id: string,
    @Query('userId') userId: string,
    @Body() body: ClosePositionDto,
  ): Promise<{ success: true } & ClosePositionResult> {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    const closeResult = await this.portfolioService.closePosition(userId, id, {
      type: body.type,
      percentage: body.percentage,
    });

    return {
      success: true,
      ...closeResult,
    };
  }
}
