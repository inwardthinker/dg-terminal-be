import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Category, OpenPosition } from './positions.types';

interface PolymarketPositionResponse {
  asset: string;
  size: number;
  eventId?: string;
  endDate?: string;
  outcome?: string;
  title?: string;
  avgPrice?: number;
  currentValue?: number;
  initialValue?: number;
  cashPnl?: number;
  percentPnl?: number;
  totalBought?: number;
  realizedPnl?: number;
  percentRealizedPnl?: number;
  curPrice?: number;
  redeemable?: boolean;
  mergeable?: boolean;
}

type Tag = {
  id: string;
  label: string;
};

type CachedCategory = {
  category: Category;
  expiresAt: number;
};

@Injectable()
export class PolymarketDataService {
  private readonly logger = new Logger(PolymarketDataService.name);
  private readonly categoryCache = new Map<string, CachedCategory>();
  private readonly inFlightCategoryFetches = new Map<
    string,
    Promise<Category>
  >();
  private readonly categoryCacheTtlMs: number;
  private readonly categoryFetchConcurrency: number;

  constructor(private readonly configService: ConfigService) {
    this.categoryCacheTtlMs = this.resolvePositiveNumberConfig(
      'POLYMARKET_EVENT_TAG_CATEGORY_TTL_MS',
      10 * 60 * 1000,
    );
    this.categoryFetchConcurrency = this.resolvePositiveNumberConfig(
      'POLYMARKET_EVENT_TAG_FETCH_CONCURRENCY',
      8,
    );
  }

  async getOpenPositions(userAddress: string): Promise<OpenPosition[]> {
    const baseUrl = this.configService.get<string>(
      'POLYMARKET_DATA_API_URL',
      'https://data-api.polymarket.com',
    );
    const params = new URLSearchParams({
      user: userAddress,
      sizeThreshold: '0',
      limit: '500',
    });

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
      `${baseUrl}/positions?${params.toString()}`,
      headers ? { headers } : undefined,
    );
    if (!response.ok) {
      throw new Error(
        `Polymarket positions request failed: ${response.status}`,
      );
    }

    const payload = (await response.json()) as PolymarketPositionResponse[];
    const openPositions = payload
      .filter((position) => Number(position.size) > 0)
      .map((position) => ({
        asset: position.asset,
        size: Number(position.size),
        eventId: this.normalizeString(position.eventId),
        endDate: this.normalizeString(position.endDate),
        outcome: this.normalizeString(position.outcome),
        title: this.normalizeString(position.title),
        avgPrice:
          typeof position.avgPrice === 'number'
            ? Number(position.avgPrice)
            : undefined,
        currentValue:
          typeof position.currentValue === 'number'
            ? Number(position.currentValue)
            : undefined,
        initialValue:
          typeof position.initialValue === 'number'
            ? Number(position.initialValue)
            : undefined,
        cashPnl:
          typeof position.cashPnl === 'number'
            ? Number(position.cashPnl)
            : undefined,
        percentPnl:
          typeof position.percentPnl === 'number'
            ? Number(position.percentPnl)
            : undefined,
        totalBought:
          typeof position.totalBought === 'number'
            ? Number(position.totalBought)
            : undefined,
        realizedPnl:
          typeof position.realizedPnl === 'number'
            ? Number(position.realizedPnl)
            : undefined,
        percentRealizedPnl:
          typeof position.percentRealizedPnl === 'number'
            ? Number(position.percentRealizedPnl)
            : undefined,
        curPrice:
          typeof position.curPrice === 'number'
            ? Number(position.curPrice)
            : undefined,
        redeemable:
          typeof position.redeemable === 'boolean'
            ? position.redeemable
            : undefined,
        mergeable:
          typeof position.mergeable === 'boolean'
            ? position.mergeable
            : undefined,
      }));

    const uniqueEventIds = [
      ...new Set(openPositions.map((p) => p.eventId).filter(Boolean)),
    ] as string[];
    const categoriesByEventId =
      await this.fetchCategoriesByEventId(uniqueEventIds);
    const enrichedOpenPositions = openPositions.map((position) => ({
      ...position,
      category: position.eventId
        ? (categoriesByEventId.get(position.eventId) ?? 'Other')
        : 'Other',
    }));

    this.logger.log(
      `Fetched ${enrichedOpenPositions.length} open positions for ${userAddress}`,
    );
    enrichedOpenPositions.forEach((position) => {
      this.logger.debug(
        `Fetched position asset=${position.asset}, size=${position.size}, eventId=${position.eventId ?? 'n/a'}, category=${position.category ?? 'Other'}, avgPrice=${position.avgPrice ?? 'n/a'}, currentValue=${position.currentValue ?? 'n/a'}, initialValue=${position.initialValue ?? 'n/a'}, cashPnl=${position.cashPnl ?? 'n/a'}, percentPnl=${position.percentPnl ?? 'n/a'}, totalBought=${position.totalBought ?? 'n/a'}, realizedPnl=${position.realizedPnl ?? 'n/a'}, percentRealizedPnl=${position.percentRealizedPnl ?? 'n/a'}, curPrice=${position.curPrice ?? 'n/a'}, redeemable=${position.redeemable ?? 'n/a'}, mergeable=${position.mergeable ?? 'n/a'}`,
      );
    });

    return enrichedOpenPositions;
  }

  private normalizeString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private async fetchEventTags(eventId: string): Promise<Tag[]> {
    const response = await fetch(
      `https://gamma-api.polymarket.com/events/${eventId}/tags`,
    );
    if (!response.ok) {
      throw new Error(
        `Polymarket event tags request failed: eventId=${eventId}, status=${response.status}`,
      );
    }

    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      return [];
    }

    return payload
      .map((item) => {
        const raw = item as Partial<Tag>;
        const normalizedLabel = this.normalizeString(raw.label);
        if (!normalizedLabel) {
          return null;
        }

        return {
          id: typeof raw.id === 'string' ? raw.id : '',
          label: normalizedLabel,
        } as Tag;
      })
      .filter((tag): tag is Tag => tag !== null);
  }

  private mapTagsToCategory(tags: Tag[]): Category {
    const normalizedLabels = new Set(
      tags
        .map((tag) => this.normalizeString(tag.label)?.toLowerCase())
        .filter((label): label is string => Boolean(label)),
    );

    if (normalizedLabels.has('sports')) {
      return 'Sports';
    }
    if (normalizedLabels.has('politics')) {
      return 'Politics';
    }
    if (normalizedLabels.has('crypto')) {
      return 'Crypto';
    }
    if (normalizedLabels.has('macro')) {
      return 'Macro';
    }

    return 'Other';
  }

  private async fetchCategoriesByEventId(
    eventIds: string[],
  ): Promise<Map<string, Category>> {
    const categoryByEventId = new Map<string, Category>();
    const queue = [...eventIds];
    const workerCount = Math.min(this.categoryFetchConcurrency, queue.length);

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (queue.length > 0) {
          const eventId = queue.shift();
          if (!eventId) {
            continue;
          }

          const category = await this.getCategoryForEventId(eventId);
          categoryByEventId.set(eventId, category);
        }
      }),
    );

    return categoryByEventId;
  }

  private async getCategoryForEventId(eventId: string): Promise<Category> {
    const cachedCategory = this.getCachedCategory(eventId);
    if (cachedCategory) {
      return cachedCategory;
    }

    const inFlightFetch = this.inFlightCategoryFetches.get(eventId);
    if (inFlightFetch) {
      return inFlightFetch;
    }

    const fetchPromise = this.fetchAndCacheCategory(eventId);
    this.inFlightCategoryFetches.set(eventId, fetchPromise);

    try {
      return await fetchPromise;
    } finally {
      this.inFlightCategoryFetches.delete(eventId);
    }
  }

  private getCachedCategory(eventId: string): Category | undefined {
    const cacheEntry = this.categoryCache.get(eventId);
    if (!cacheEntry) {
      return undefined;
    }

    if (cacheEntry.expiresAt <= Date.now()) {
      this.categoryCache.delete(eventId);
      return undefined;
    }

    return cacheEntry.category;
  }

  private async fetchAndCacheCategory(eventId: string): Promise<Category> {
    try {
      const tags = await this.fetchEventTags(eventId);
      const category = this.mapTagsToCategory(tags);
      this.categoryCache.set(eventId, {
        category,
        expiresAt: Date.now() + this.categoryCacheTtlMs,
      });
      return category;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to fetch tags for event ${eventId}: ${message}; defaulting category to Other`,
      );
      return 'Other';
    }
  }

  private resolvePositiveNumberConfig(key: string, fallback: number): number {
    const configuredValue = Number(this.configService.get<string>(key));
    return Number.isFinite(configuredValue) && configuredValue > 0
      ? configuredValue
      : fallback;
  }
}
