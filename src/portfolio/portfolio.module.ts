import { Module } from '@nestjs/common';
import { PortfolioController } from './portfolio.controller';
import { PortfolioAuthHeaderGuard } from './guards/portfolio-auth-header.guard';
import { PortfolioService } from './portfolio.service';

@Module({
  controllers: [PortfolioController],
  providers: [PortfolioService, PortfolioAuthHeaderGuard],
})
export class PortfolioModule {}
