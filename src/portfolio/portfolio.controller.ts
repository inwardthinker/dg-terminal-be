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
  ClosePositionRequest,
  ClosePositionResult,
  HistoryPeriod,
  PortfolioKpis,
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

    let request: ClosePositionRequest;
    if (body.type === 'partial') {
      const percentage = body.percentage;
      if (typeof percentage !== 'number') {
        throw new BadRequestException(
          'percentage is required when type is partial',
        );
      }
      request = {
        type: 'partial',
        percentage,
      };
    } else {
      request = { type: 'full' };
    }

    const closeResult = await this.portfolioService.closePosition(
      userId,
      id,
      request,
    );

    return {
      success: true,
      ...closeResult,
    };
  }

  @Get('kpis')
  async getKpis(@Query('wallet') wallet: string): Promise<PortfolioKpis> {
    if (!wallet) {
      throw new BadRequestException('wallet is required');
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      throw new BadRequestException(
        'wallet must be a valid 0x-prefixed address',
      );
    }
    return this.portfolioService.getKpis(wallet);
  }
}
