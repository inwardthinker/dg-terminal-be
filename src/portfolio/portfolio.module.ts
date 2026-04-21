import { Module } from '@nestjs/common';
import { PortfolioController } from './portfolio.controller';
import { PortfolioAuthHeaderGuard } from './guards/portfolio-auth-header.guard';
import { PortfolioClosedPositionsRepository } from './repositories/portfolio-closed-positions.repository';
import { PortfolioPositionsRepository } from './repositories/portfolio-positions.repository';
import { PortfolioService } from './portfolio.service';

@Module({
  controllers: [PortfolioController],
  providers: [
    PortfolioService,
    PortfolioAuthHeaderGuard,
    PortfolioPositionsRepository,
    PortfolioClosedPositionsRepository,
  ],
})
export class PortfolioModule {}
