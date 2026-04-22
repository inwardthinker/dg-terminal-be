import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetPortfolioTradesQueryDto } from '../dto/get-portfolio-trades.query.dto';
import {
  PortfolioTrade,
  PortfolioTradeActivity,
  PortfolioTradeOutcome,
  PortfolioTrades,
} from '../types/portfolio-trades.type';

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
      user: query.walletAddress,
      limit: String(limit),
      offset: String(offset),
    });

    if (query.page !== undefined) params.set('page', String(query.page));
    if (query.per_page !== undefined)
      params.set('per_page', String(query.per_page));
    params.set('period', query.period ?? '30d');
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

    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) return [];
    return payload.map((row) => this.withNormalizedColumns(row));
  }

  private withNormalizedColumns(row: unknown): PortfolioTrade {
    const raw = this.asRecord(row);
    const timestamp = this.toNumber(raw.timestamp);
    const date = timestamp
      ? new Date(timestamp * 1000).toISOString()
      : new Date(0).toISOString();
    const entryPrice = this.toNullableNumber(raw.price);
    const quantity = this.toNumber(raw.size);
    const size =
      this.toNullableNumber(raw.usdcSize) ??
      (entryPrice !== null ? quantity * entryPrice : quantity);
    const pnl =
      this.toNullableNumber(raw.realizedPnl) ??
      this.toNullableNumber(raw.cashPnl) ??
      null;
    const outcome = this.mapOutcome(raw, pnl);

    return {
      ...raw,
      date,
      market: this.toString(raw.title),
      side: this.toString(raw.side),
      entry_price: entryPrice,
      exit_price: null,
      size,
      outcome,
      pnl,
      venue: 'Polymarket',
    };
  }

  private mapOutcome(
    raw: PortfolioTradeActivity,
    pnl: number | null,
  ): PortfolioTradeOutcome | null {
    const candidates = [
      raw.outcomeStatus,
      raw.outcome_status,
      raw.settlementOutcome,
      raw.settlement_outcome,
      raw.result,
      raw.positionOutcome,
      raw.position_outcome,
      raw.status,
      raw.outcome,
    ];

    for (const value of candidates) {
      const mapped = this.mapOutcomeValue(value);
      if (mapped) return mapped;
    }

    if (pnl !== null) {
      if (pnl > 0) return 'WON';
      if (pnl < 0) return 'LOST';
      return 'PUSHED';
    }

    return null;
  }

  private mapOutcomeValue(value: unknown): PortfolioTradeOutcome | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toUpperCase();
    if (!normalized) return null;
    if (
      normalized === 'WON' ||
      normalized === 'WIN' ||
      normalized === 'SUCCESS'
    )
      return 'WON';
    if (
      normalized === 'LOST' ||
      normalized === 'LOSS' ||
      normalized === 'LOSE' ||
      normalized === 'FAILED'
    ) {
      return 'LOST';
    }
    if (
      normalized === 'PUSHED' ||
      normalized === 'PUSH' ||
      normalized === 'VOID' ||
      normalized === 'VOIDED' ||
      normalized === 'DRAW'
    ) {
      return 'PUSHED';
    }
    return null;
  }

  private asRecord(value: unknown): PortfolioTradeActivity {
    if (typeof value !== 'object' || value === null) return {};
    return value as PortfolioTradeActivity;
  }

  private toString(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }
    return '';
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private toNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }
}
