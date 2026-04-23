import { Injectable, Logger } from '@nestjs/common';
import { GetPortfolioClosedPositionsQueryDto } from './dto/get-portfolio-closed-positions.query.dto';
import { GetPortfolioPositionsQueryDto } from './dto/get-portfolio-positions.query.dto';
import { GetPortfolioSummaryQueryDto } from './dto/get-portfolio-summary.query.dto';
import { GetPortfolioTradesQueryDto } from './dto/get-portfolio-trades.query.dto';
import { PortfolioSummaryResponseDto } from './dto/portfolio-summary.response.dto';
import { PortfolioClosedPositionsRepository } from './repositories/portfolio-closed-positions.repository';
import { PortfolioPositionsRepository } from './repositories/portfolio-positions.repository';
import { PortfolioSummaryRepository } from './repositories/portfolio-summary.repository';
import { PortfolioTradesRepository } from './repositories/portfolio-trades.repository';
import { PortfolioHistoryRepository } from './repositories/portfolio-history.repository';
import { PortfolioClosedPosition } from './types/portfolio-closed-position.type';
import {
  HistoryPeriod,
  HistoryPoint,
  PortfolioHistoryResponse,
} from './types/portfolio-history.type';
import { PortfolioPosition } from './types/portfolio-position.type';
import { PortfolioTrade, PortfolioTrades } from './types/portfolio-trades.type';

@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);

  constructor(
    private readonly positionsRepository: PortfolioPositionsRepository,
    private readonly closedPositionsRepository: PortfolioClosedPositionsRepository,
    private readonly summaryRepository: PortfolioSummaryRepository,
    private readonly tradesRepository: PortfolioTradesRepository,
    private readonly historyRepository?: PortfolioHistoryRepository,
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
        query.walletAddress,
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
    page: number;
    per_page: number;
    total_count: number;
    total_pages: number;
  }> {
    try {
      const closedPositions = await this.closedPositionsRepository.findByWallet(
        {
          walletAddress: query.walletAddress,
          limit: 500,
          offset: 0,
          sort_by: 'closed_at',
          sort_dir: 'desc',
        },
      );
      const trades = this.buildTradesFromClosedPositions(closedPositions);
      const period = query.period ?? '30d';
      const periodFilteredTrades = this.filterByPeriod(trades, period);
      const outcomeFilteredTrades = this.filterByOutcome(
        periodFilteredTrades,
        query.outcome,
      );
      const sortedTrades = this.sortTrades(
        outcomeFilteredTrades,
        query.sort_by,
        query.sort_dir,
      );
      const page = query.page ?? 1;
      const perPage = query.per_page ?? 25;
      const paginatedTrades = this.paginateTrades(sortedTrades, page, perPage);
      const totalCount = sortedTrades.length;
      const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / perPage);

      return {
        trades: paginatedTrades,
        page,
        per_page: perPage,
        total_count: totalCount,
        total_pages: totalPages,
      };
    } catch {
      return {
        trades: [],
        page: query.page ?? 1,
        per_page: query.per_page ?? 25,
        total_count: 0,
        total_pages: 0,
      };
    }
  }

  async getHistory(
    userId: string,
    period: HistoryPeriod,
  ): Promise<PortfolioHistoryResponse> {
    const emptyRanges = this.buildRanges([]);
    const parsedUserId = Number.parseInt(userId, 10);

    if (!this.historyRepository) {
      return {
        userId: Number.isNaN(parsedUserId) ? 0 : parsedUserId,
        asOfDate: null,
        points: [],
        ranges: emptyRanges,
      };
    }

    try {
      const allSnapshots = await this.historyRepository.findByUserId(userId);
      const ranges = this.buildRanges(allSnapshots);
      const selectedSnapshots = this.sliceByPeriod(
        allSnapshots,
        period,
        ranges,
      );
      const points = this.toHistoryPoints(selectedSnapshots);

      return {
        userId: Number.isNaN(parsedUserId) ? 0 : parsedUserId,
        asOfDate: points.length > 0 ? points[points.length - 1].date : null,
        points,
        ranges,
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch portfolio history for userId=${userId}, period=${period}`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        userId: Number.isNaN(parsedUserId) ? 0 : parsedUserId,
        asOfDate: null,
        points: [],
        ranges: emptyRanges,
      };
    }
  }

  private toHistoryPoints(
    snapshots: Array<{ date: string; balanceValue: number }>,
  ): HistoryPoint[] {
    return snapshots.map((snapshot, index) => {
      const previous = index > 0 ? snapshots[index - 1].balanceValue : null;
      return {
        date: snapshot.date,
        balanceValue: snapshot.balanceValue,
        dailyChange:
          previous === null
            ? 0
            : Number((snapshot.balanceValue - previous).toFixed(2)),
      };
    });
  }

  private sliceByPeriod(
    snapshots: Array<{ date: string; balanceValue: number }>,
    period: HistoryPeriod,
    ranges: PortfolioHistoryResponse['ranges'],
  ): Array<{ date: string; balanceValue: number }> {
    const range = ranges[period];
    if (range.pointsCount <= 0 || range.startIndex < 0 || range.endIndex < 0) {
      return [];
    }
    return snapshots.slice(range.startIndex, range.endIndex + 1);
  }

  private buildRanges(
    snapshots: Array<{ date: string; balanceValue: number }>,
  ): PortfolioHistoryResponse['ranges'] {
    const buildRange = (windowSize: number | null) => {
      const total = snapshots.length;
      if (total === 0) {
        return {
          startIndex: -1,
          endIndex: -1,
          pointsCount: 0,
          insufficientHistory: true,
          startValue: 0,
          endValue: 0,
          changePct: 0,
        };
      }

      const pointsCount =
        windowSize === null ? total : Math.min(total, windowSize);
      const startIndex = total - pointsCount;
      const endIndex = total - 1;
      const startValue = snapshots[startIndex].balanceValue;
      const endValue = snapshots[endIndex].balanceValue;
      const insufficientHistory =
        windowSize === null ? false : total < windowSize;
      const changePct =
        startValue === 0
          ? 0
          : Number((((endValue - startValue) / startValue) * 100).toFixed(2));

      return {
        startIndex,
        endIndex,
        pointsCount,
        insufficientHistory,
        startValue,
        endValue,
        changePct,
      };
    };

    return {
      '7d': buildRange(7),
      '30d': buildRange(30),
      '90d': buildRange(90),
      all: buildRange(null),
    };
  }

  private buildTradesFromClosedPositions(
    closedPositions: PortfolioClosedPosition[],
  ): PortfolioTrades {
    return closedPositions.map((closed) => {
      const pnl = closed.realized_pnl;
      const outcome = this.pnlToOutcome(pnl);
      return {
        ...closed,
        date: closed.closed_at || closed.end_date,
        market: closed.market_name,
        side: closed.side,
        entry_price: closed.avg_entry_price,
        exit_price: closed.current_price,
        size: closed.cost_basis,
        outcome,
        pnl,
        venue: closed.venue || 'Polymarket',
      };
    });
  }

  private filterByPeriod(
    trades: PortfolioTrades,
    period: '1d' | '7d' | '30d' | 'all',
  ): PortfolioTrades {
    if (period === 'all') return trades;
    const now = Date.now();
    const days = period === '1d' ? 1 : period === '7d' ? 7 : 30;
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    return trades.filter((trade) => {
      const date = this.parseDate(trade.date);
      return date !== null && date.getTime() >= cutoff;
    });
  }

  private filterByOutcome(
    trades: PortfolioTrades,
    outcome?: string,
  ): PortfolioTrades {
    if (!outcome) return trades;
    const normalized = outcome.toUpperCase();
    if (
      normalized !== 'WON' &&
      normalized !== 'LOST' &&
      normalized !== 'PUSHED'
    ) {
      return trades;
    }
    return trades.filter((trade) => trade.outcome === normalized);
  }

  private sortTrades(
    trades: PortfolioTrades,
    sortBy?: string,
    sortDir?: 'asc' | 'desc',
  ): PortfolioTrades {
    const direction = (sortDir ?? 'desc').toLowerCase() === 'asc' ? 1 : -1;
    const key = (sortBy ?? 'date').toLowerCase();
    const sorted = [...trades];
    sorted.sort((a, b) => {
      const left = this.sortValue(a, key);
      const right = this.sortValue(b, key);
      if (left < right) return -1 * direction;
      if (left > right) return 1 * direction;
      return 0;
    });
    return sorted;
  }

  private sortValue(trade: PortfolioTrade, key: string): string | number {
    switch (key) {
      case 'market':
        return trade.market ?? '';
      case 'side':
        return trade.side ?? '';
      case 'entry_price':
        return trade.entry_price ?? Number.NEGATIVE_INFINITY;
      case 'exit_price':
        return trade.exit_price ?? Number.NEGATIVE_INFINITY;
      case 'size':
        return trade.size ?? Number.NEGATIVE_INFINITY;
      case 'pnl':
        return trade.pnl ?? Number.NEGATIVE_INFINITY;
      case 'outcome':
        return trade.outcome ?? '';
      case 'venue':
        return trade.venue ?? '';
      case 'date':
      default:
        return this.parseDate(trade.date)?.getTime() ?? 0;
    }
  }

  private paginateTrades(
    trades: PortfolioTrades,
    page: number,
    perPage: number,
  ): PortfolioTrades {
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const safePerPage =
      Number.isFinite(perPage) && perPage > 0 ? Math.floor(perPage) : 25;
    const start = (safePage - 1) * safePerPage;
    return trades.slice(start, start + safePerPage);
  }

  private parseDate(value: string): Date | null {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private pnlToOutcome(pnl: number | null): 'WON' | 'LOST' | 'PUSHED' | null {
    if (pnl === null) return null;
    if (pnl > 0) return 'WON';
    if (pnl < 0) return 'LOST';
    return 'PUSHED';
  }
}
