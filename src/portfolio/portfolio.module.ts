import { Module } from '@nestjs/common';
import { PortfolioController } from './portfolio.controller';
import { PortfolioKpisGateway } from './portfolio-kpis.gateway';
import { PortfolioService } from './portfolio.service';

@Module({
  controllers: [PortfolioController],
  providers: [PortfolioService, PortfolioKpisGateway],
})
export class PortfolioModule {}
