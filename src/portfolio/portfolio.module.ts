import { Module } from '@nestjs/common';
import { PortfolioController } from './portfolio.controller';
import { PortfolioAuthHeaderGuard } from './guards/portfolio-auth-header.guard';
import { PortfolioClosedPositionsRepository } from './repositories/portfolio-closed-positions.repository';
import { PortfolioPositionsRepository } from './repositories/portfolio-positions.repository';
import { PortfolioSummaryRepository } from './repositories/portfolio-summary.repository';
import { PortfolioTradesRepository } from './repositories/portfolio-trades.repository';
import { PortfolioService } from './portfolio.service';

@Module({
  controllers: [PortfolioController],
  providers: [
    PortfolioService,
    PortfolioAuthHeaderGuard,
    PortfolioPositionsRepository,
    PortfolioClosedPositionsRepository,
    PortfolioSummaryRepository,
    PortfolioTradesRepository,
  ],
})
export class PortfolioModule {}
