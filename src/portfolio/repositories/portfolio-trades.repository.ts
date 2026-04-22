import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetPortfolioTradesQueryDto } from '../dto/get-portfolio-trades.query.dto';
import { PortfolioTrades } from '../types/portfolio-trades.type';

const SORT_BY_ALIAS_MAP: Record<string, 'TIMESTAMP' | 'TOKENS' | 'CASH'> = {
  timestamp: 'TIMESTAMP',
  created_at: 'TIMESTAMP',
  time: 'TIMESTAMP',
  tokens: 'TOKENS',
  token: 'TOKENS',
  size: 'TOKENS',
  cash: 'CASH',
  usdc: 'CASH',
  usd: 'CASH',
};

@Injectable()
export class PortfolioTradesRepository {
  constructor(private readonly configService: ConfigService) {}

  async findByWallet(
    query: GetPortfolioTradesQueryDto,
  ): Promise<PortfolioTrades> {
    const baseUrl = this.configService.get<string>(
      'POLYMARKET_DATA_API_URL',
      'https://data-api.polymarket.com',
    );

    const limit = query.limit ?? query.per_page ?? 25;
    const page = query.page ?? 1;
    const computedOffset = (page - 1) * limit;
    const offset = query.offset ?? computedOffset;
    const requestedSortBy = (query.sortBy ?? query.sort_by)?.trim();
    const sortBy = requestedSortBy
      ? (SORT_BY_ALIAS_MAP[requestedSortBy.toLowerCase()] ??
        (requestedSortBy.toUpperCase() as 'TIMESTAMP' | 'TOKENS' | 'CASH'))
      : undefined;
    const sortDirectionRaw = (
      query.sortDirection ?? query.sort_dir
    )?.toUpperCase();
    const sortDirection =
      sortDirectionRaw === 'ASC' || sortDirectionRaw === 'DESC'
        ? sortDirectionRaw
        : undefined;

    const params = new URLSearchParams({
      user: query.wallet,
      limit: String(limit),
      offset: String(offset),
    });

    if (query.page !== undefined) params.set('page', String(query.page));
    if (query.per_page !== undefined)
      params.set('per_page', String(query.per_page));
    if (query.period) params.set('period', query.period);
    if (sortBy) params.set('sortBy', sortBy);
    if (sortDirection) params.set('sortDirection', sortDirection);
    if (query.sort_by) params.set('sort_by', query.sort_by);
    if (query.sort_dir) params.set('sort_dir', query.sort_dir);
    if (query.outcome) params.set('outcome', query.outcome);
    if (query.market) params.set('market', query.market);
    if (query.eventId) params.set('eventId', query.eventId);
    if (query.type) params.set('type', query.type);
    if (query.side) params.set('side', query.side);
    if (query.start !== undefined) params.set('start', String(query.start));
    if (query.end !== undefined) params.set('end', String(query.end));
    if (query.excludeDepositsWithdrawals !== undefined) {
      params.set(
        'excludeDepositsWithdrawals',
        String(query.excludeDepositsWithdrawals),
      );
    }

    const authHeaderName = this.configService.get<string>(
      'POLYMARKET_DATA_API_AUTH_HEADER_NAME',
      '',
    );
    const authHeaderValue = this.configService.get<string>(
      'POLYMARKET_DATA_API_AUTH_HEADER_VALUE',
      '',
    );
    const headers =
      authHeaderName && authHeaderValue
        ? { [authHeaderName]: authHeaderValue }
        : undefined;

    const response = await fetch(
      `${baseUrl}/activity?${params.toString()}`,
      headers ? { headers } : undefined,
    );

    if (!response.ok) {
      throw new Error(`Polymarket trades request failed: ${response.status}`);
    }

    return (await response.json()) as PortfolioTrades;
  }
}
