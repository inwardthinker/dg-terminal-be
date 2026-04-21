import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { GetPortfolioClosedPositionsQueryDto } from './dto/get-portfolio-closed-positions.query.dto';
import { GetPortfolioPositionsQueryDto } from './dto/get-portfolio-positions.query.dto';
import { GetPortfolioSummaryQueryDto } from './dto/get-portfolio-summary.query.dto';
import { PortfolioAuthHeaderGuard } from './guards/portfolio-auth-header.guard';
import { PortfolioService } from './portfolio.service';

@Controller('api/portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

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
}
