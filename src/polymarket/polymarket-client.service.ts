import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PortfolioClosedPosition } from '../portfolio/types/portfolio-closed-position.type';
import { PortfolioPosition } from '../portfolio/types/portfolio-position.type';
import { PolymarketRawClosedPosition } from './types/polymarket-closed-position.type';
import { PolymarketRawPosition } from './types/polymarket-position.type';
import { mapPolymarketClosedPosition } from './utils/map-closed-position.util';
import { mapPolymarketPosition } from './utils/map-position.util';

@Injectable()
export class PolymarketClientService {
  private readonly marketCategoryCache = new Map<string, string>();

  constructor(private readonly configService: ConfigService) {}

  async getOpenPositions(walletAddress: string): Promise<PortfolioPosition[]> {
    /**
     * Open positions for portfolio views are served by Polymarket's Data API
     * (`data-api.polymarket.com`), same as the web app — not the CLOB host.
     * `ClobClient` remains injected for future trading / order flows.
     */
    const dataApiBase = this.configService.get<string>(
      'POLYMARKET_DATA_API_BASE_URL',
      'https://data-api.polymarket.com',
    );
    const url = new URL(`${dataApiBase.replace(/\/$/, '')}/positions`);
    url.searchParams.set('user', walletAddress);
    url.searchParams.set('sortBy', 'CURRENT');
    url.searchParams.set('sortDirection', 'DESC');
    url.searchParams.set('sizeThreshold', '0.1');
    url.searchParams.set('limit', '100');
    url.searchParams.set('offset', '0');

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return [];
    }

    const payload: unknown = await response.json();
    const rawList = Array.isArray(payload)
      ? payload
      : this.extractArrayFromObject(payload);

    const rawPositions = rawList.map((position) =>
      this.toRawPosition(position),
    );
    await this.enrichCategoriesForAssets(rawPositions);

    return rawPositions
      .filter((position) => Number.parseFloat(position.size) > 0)
      .filter((position) => Number.parseFloat(position.cur_price) > 0)
      .map(mapPolymarketPosition)
      .filter((p) => p.shares > 0);
  }

  async getClosedPositions(
    walletAddress: string,
    options: { limit: number; offset: number },
  ): Promise<PortfolioClosedPosition[]> {
    const dataApiBase = this.configService.get<string>(
      'POLYMARKET_DATA_API_BASE_URL',
      'https://data-api.polymarket.com',
    );
    const url = new URL(`${dataApiBase.replace(/\/$/, '')}/closed-positions`);
    url.searchParams.set('user', walletAddress);
    url.searchParams.set('sortBy', 'realizedpnl');
    url.searchParams.set('sortDirection', 'DESC');
    url.searchParams.set('limit', String(options.limit));
    url.searchParams.set('offset', String(options.offset));

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return [];
    }

    const payload: unknown = await response.json();
    const rawList = Array.isArray(payload)
      ? payload
      : this.extractArrayFromObject(payload);

    const rawClosed = rawList.map((row) => this.toRawClosedPosition(row));
    await this.enrichCategoriesForAssets(rawClosed);

    return rawClosed
      .filter((position) => Number.parseFloat(position.size) > 0)
      .map(mapPolymarketClosedPosition)
      .filter((p) => p.shares > 0);
  }

  private extractArrayFromObject(payload: unknown): unknown[] {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const candidate = payload as { data?: unknown; positions?: unknown };

    if (Array.isArray(candidate.data)) {
      return candidate.data;
    }

    if (Array.isArray(candidate.positions)) {
      return candidate.positions;
    }

    return [];
  }

  private toRawPosition(raw: unknown): PolymarketRawPosition {
    const source = (raw ?? {}) as Record<string, unknown>;

    const conditionId = this.toString(
      source.conditionId ?? source.condition_id ?? '',
    );
    const outcomeTokenId = this.toString(source.asset ?? '');
    const title = this.toString(
      source.title ??
        source.market ??
        source.question ??
        source.name ??
        'Unknown Market',
    );

    const sizeRaw = source.size;
    const avgPriceRaw =
      source.avgPrice ?? source.avg_price ?? source.avg_entry_price ?? 0;
    const curPriceRaw =
      source.curPrice ??
      source.cur_price ??
      source.current_price ??
      source.currentPrice ??
      source.mark_price ??
      source.last_price ??
      0;

    const initialValueRaw = source.initialValue ?? source.initial_value;
    const currentValueRaw = source.currentValue ?? source.current_value;
    const cashPnlRaw = source.cashPnl ?? source.cash_pnl;
    const percentPnlRaw = source.percentPnl ?? source.percent_pnl;
    const totalBoughtRaw = source.totalBought ?? source.total_bought;
    const realizedPnlRaw = source.realizedPnl ?? source.realized_pnl;
    const percentRealizedPnlRaw =
      source.percentRealizedPnl ?? source.percent_realized_pnl;
    const outcomeIndexRaw = source.outcomeIndex ?? source.outcome_index;

    return {
      market: title,
      condition_id: conditionId,
      outcome_token_id: outcomeTokenId || undefined,
      proxy_wallet: this.toString(
        source.proxyWallet ?? source.proxy_wallet ?? '',
      ),
      category: this.toString(source.category ?? source.group ?? ''),
      side: this.toString(
        source.side ?? source.outcome ?? source.outcomeName ?? 'UNKNOWN',
      ),
      size:
        typeof sizeRaw === 'number'
          ? String(sizeRaw)
          : this.toString(sizeRaw ?? source.shares ?? source.amount ?? 0),
      avg_price:
        typeof avgPriceRaw === 'number'
          ? String(avgPriceRaw)
          : this.toString(avgPriceRaw),
      cur_price:
        typeof curPriceRaw === 'number'
          ? String(curPriceRaw)
          : this.toString(curPriceRaw),
      initial_value:
        initialValueRaw !== undefined && initialValueRaw !== null
          ? this.scalarToString(initialValueRaw)
          : undefined,
      current_value:
        currentValueRaw !== undefined && currentValueRaw !== null
          ? this.scalarToString(currentValueRaw)
          : undefined,
      cash_pnl:
        cashPnlRaw !== undefined && cashPnlRaw !== null
          ? this.scalarToString(cashPnlRaw)
          : undefined,
      percent_pnl:
        percentPnlRaw !== undefined && percentPnlRaw !== null
          ? this.scalarToString(percentPnlRaw)
          : undefined,
      total_bought:
        totalBoughtRaw !== undefined && totalBoughtRaw !== null
          ? this.scalarToString(totalBoughtRaw)
          : undefined,
      realized_pnl:
        realizedPnlRaw !== undefined && realizedPnlRaw !== null
          ? this.scalarToString(realizedPnlRaw)
          : undefined,
      percent_realized_pnl:
        percentRealizedPnlRaw !== undefined && percentRealizedPnlRaw !== null
          ? this.scalarToString(percentRealizedPnlRaw)
          : undefined,
      slug: this.toString(source.slug ?? ''),
      icon: this.toString(source.icon ?? ''),
      event_id: this.toString(source.eventId ?? source.event_id ?? ''),
      event_slug: this.toString(source.eventSlug ?? source.event_slug ?? ''),
      outcome_index:
        outcomeIndexRaw !== undefined && outcomeIndexRaw !== null
          ? this.scalarToString(outcomeIndexRaw)
          : undefined,
      opposite_outcome: this.toString(
        source.oppositeOutcome ?? source.opposite_outcome ?? '',
      ),
      opposite_asset: this.toString(
        source.oppositeAsset ?? source.opposite_asset ?? '',
      ),
      end_date: this.toString(source.endDate ?? source.end_date ?? ''),
      redeemable: this.boolishToString(source.redeemable),
      mergeable: this.boolishToString(source.mergeable),
      negative_risk: this.boolishToString(
        source.negativeRisk ?? source.negative_risk,
      ),
    };
  }

  private boolishToString(value: unknown): string | undefined {
    if (value === true) {
      return 'true';
    }
    if (value === false) {
      return 'false';
    }
    if (value === undefined || value === null) {
      return undefined;
    }
    return this.scalarToString(value);
  }

  private toRawClosedPosition(raw: unknown): PolymarketRawClosedPosition {
    const source = (raw ?? {}) as Record<string, unknown>;

    const title = this.toString(
      source.title ?? source.market ?? source.question ?? 'Unknown Market',
    );
    const conditionId = this.toString(
      source.conditionId ?? source.condition_id ?? '',
    );
    const outcomeTokenId = this.toString(source.asset ?? '');

    const avgPriceRaw = source.avgPrice ?? source.avg_price ?? 0;
    const totalBoughtRaw = source.totalBought ?? source.total_bought ?? 0;
    const realizedPnlRaw = source.realizedPnl ?? source.realized_pnl ?? 0;
    const curPriceRaw = source.curPrice ?? source.cur_price ?? 0;
    const outcome = this.toString(
      source.outcome ?? source.side ?? source.outcomeName ?? 'UNKNOWN',
    );
    const endDate = this.toString(source.endDate ?? source.end_date ?? '');
    const outcomeIndexRaw = source.outcomeIndex ?? source.outcome_index;
    const tsRaw = source.timestamp;

    let timestamp = 0;
    if (typeof tsRaw === 'number' && Number.isFinite(tsRaw)) {
      timestamp = tsRaw;
    } else if (typeof tsRaw === 'string' || typeof tsRaw === 'bigint') {
      const parsed = Number.parseInt(this.scalarToString(tsRaw), 10);
      timestamp = Number.isFinite(parsed) ? parsed : 0;
    }

    return {
      market: title,
      condition_id: conditionId,
      outcome_token_id: outcomeTokenId || undefined,
      proxy_wallet: this.toString(
        source.proxyWallet ?? source.proxy_wallet ?? '',
      ),
      category: this.toString(source.category ?? source.group ?? ''),
      side: outcome,
      size:
        typeof totalBoughtRaw === 'number'
          ? String(totalBoughtRaw)
          : this.toString(totalBoughtRaw),
      avg_price:
        typeof avgPriceRaw === 'number'
          ? String(avgPriceRaw)
          : this.toString(avgPriceRaw),
      cur_price:
        typeof curPriceRaw === 'number'
          ? String(curPriceRaw)
          : this.toString(curPriceRaw),
      realized_pnl:
        typeof realizedPnlRaw === 'number'
          ? String(realizedPnlRaw)
          : this.toString(realizedPnlRaw),
      end_date: endDate,
      timestamp,
      slug: this.toString(source.slug ?? ''),
      icon: this.toString(source.icon ?? ''),
      event_id: this.toString(source.eventId ?? source.event_id ?? ''),
      event_slug: this.toString(source.eventSlug ?? source.event_slug ?? ''),
      outcome_index:
        outcomeIndexRaw !== undefined && outcomeIndexRaw !== null
          ? this.scalarToString(outcomeIndexRaw)
          : undefined,
      opposite_outcome: this.toString(
        source.oppositeOutcome ?? source.opposite_outcome ?? '',
      ),
      opposite_asset: this.toString(
        source.oppositeAsset ?? source.opposite_asset ?? '',
      ),
    };
  }

  private toString(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
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

  private scalarToString(value: unknown): string {
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

  private async enrichCategoriesForAssets(
    items: Array<{
      condition_id: string;
      slug?: string;
      event_id?: string;
      event_slug?: string;
      category?: string;
    }>,
  ): Promise<void> {
    const uncategorized = items.filter((item) => !item.category);
    if (uncategorized.length === 0) return;

    const gammaBaseUrl = this.configService.get<string>(
      'POLYMARKET_GAMMA_BASE_URL',
      'https://gamma-api.polymarket.com',
    );

    // Step 1: serve from in-memory cache
    for (const item of uncategorized) {
      const cached = this.marketCategoryCache.get(item.condition_id);
      if (cached) item.category = cached;
    }

    // Steps 2+3: fire batch AND fallbacks simultaneously
    const stillUncategorized = uncategorized.filter((item) => !item.category);
    const idsToFetch = Array.from(
      new Set(
        stillUncategorized.map((item) => item.condition_id).filter(Boolean),
      ),
    );

    const fallbackCandidates = stillUncategorized.filter(
      (item) => item.event_id || item.slug || item.event_slug,
    );

    const [batchResult, fallbackMap] = await Promise.all([
      idsToFetch.length > 0
        ? this.fetchCategoriesBatch(idsToFetch, gammaBaseUrl)
        : Promise.resolve(new Map<string, string>()),
      this.fetchFallbackCategories(fallbackCandidates, gammaBaseUrl),
    ]);

    // Batch takes priority; fallback fills remaining gaps
    for (const item of stillUncategorized) {
      const resolved =
        batchResult.get(item.condition_id) ??
        fallbackMap.get(item.condition_id);
      if (resolved) {
        item.category = resolved;
        this.marketCategoryCache.set(item.condition_id, resolved);
      }
    }

    // Final fallback
    for (const item of uncategorized) {
      if (!item.category) item.category = 'Unknown';
    }
  }

  /** Parallel Gamma requests — one per CHUNK_SIZE-sized slice of condition_ids. */
  private async fetchCategoriesBatch(
    conditionIds: string[],
    gammaBaseUrl: string,
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const CHUNK_SIZE = 25;
    const chunks: string[][] = [];
    for (let i = 0; i < conditionIds.length; i += CHUNK_SIZE) {
      chunks.push(conditionIds.slice(i, i + CHUNK_SIZE));
    }

    await Promise.all(
      chunks.map(async (chunk) => {
        try {
          const url = `${gammaBaseUrl}/markets?condition_ids=${chunk.join(',')}`;
          const response = await fetch(url, {
            signal: AbortSignal.timeout(8_000),
          });
          if (!response.ok) return;

          const payload: unknown = await response.json();
          if (!Array.isArray(payload)) return;

          for (const market of payload) {
            if (!market || typeof market !== 'object') continue;
            const m = market as Record<string, unknown>;
            const condId = this.toString(m.conditionId ?? m.condition_id ?? '');
            if (!condId) continue;
            const category = this.extractCategory(m);
            if (category) result.set(condId, category);
          }
        } catch {
          // chunk failed; other chunks still complete
        }
      }),
    );

    return result;
  }

  /** Runs all fallback lookups in parallel, returns a condition_id → category map. */
  private async fetchFallbackCategories(
    items: Array<{
      condition_id: string;
      event_id?: string;
      slug?: string;
      event_slug?: string;
    }>,
    gammaBaseUrl: string,
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    if (items.length === 0) return results;

    await Promise.all(
      items.map(async (item) => {
        const category = await this.fetchCategoryFallback(item, gammaBaseUrl);
        if (category) results.set(item.condition_id, category);
      }),
    );

    return results;
  }

  /**
   * Fallback category lookup for markets not resolved by the batch condition_ids request.
   * Tries in priority order:
   *   1. GET /events/{event_id}   — direct event lookup (most reliable)
   *   2. GET /markets?slug={slug} — market slug lookup
   *   3. GET /events?slug={event_slug} — event slug lookup (event_slug only, never market slug)
   */
  private async fetchCategoryFallback(
    item: { event_id?: string; slug?: string; event_slug?: string },
    gammaBaseUrl: string,
  ): Promise<string | undefined> {
    const paths: string[] = [];

    if (item.event_id) {
      paths.push(`/events/${encodeURIComponent(item.event_id)}`);
    }
    if (item.slug) {
      paths.push(`/markets?slug=${encodeURIComponent(item.slug)}`);
    }
    if (item.event_slug) {
      paths.push(`/events?slug=${encodeURIComponent(item.event_slug)}`);
    }

    for (const path of paths) {
      try {
        const response = await fetch(`${gammaBaseUrl}${path}`, {
          signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) continue;
        const payload: unknown = await response.json();
        const category = this.extractCategory(payload);
        if (category) return category;
      } catch {
        continue;
      }
    }

    return undefined;
  }

  private extractCategory(payload: unknown): string | undefined {
    if (!payload) {
      return undefined;
    }

    if (Array.isArray(payload)) {
      for (const item of payload) {
        const category = this.extractCategory(item);
        if (category) {
          return category;
        }
      }
      return undefined;
    }

    if (typeof payload !== 'object') {
      return undefined;
    }

    const source = payload as Record<string, unknown>;
    const rawCategory =
      source.category ??
      source.group ??
      source.market_category ??
      source.parentCategory;

    if (typeof rawCategory === 'string' && rawCategory.trim()) {
      return rawCategory;
    }

    const tags = source.tags;
    if (Array.isArray(tags)) {
      for (const tag of tags) {
        if (typeof tag === 'string' && tag.trim()) {
          return tag;
        }
        if (tag && typeof tag === 'object') {
          const label = (tag as Record<string, unknown>).label;
          if (typeof label === 'string' && label.trim()) {
            return label;
          }
        }
      }
    }

    // Recurse into nested event object — Gamma often stores category at event level
    const nestedEvent = source.event;
    if (nestedEvent && typeof nestedEvent === 'object') {
      const eventCategory = this.extractCategory(nestedEvent);
      if (eventCategory) return eventCategory;
    }

    return undefined;
  }
}
