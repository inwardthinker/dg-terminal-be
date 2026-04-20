import { WorkerConfig } from './config';

export type OpenPositionApiRow = Record<string, unknown>;
export type ClosedPositionApiRow = Record<string, unknown>;
export type ActivityRow = Record<string, unknown>;

export class PolymarketDataApi {
  constructor(private readonly config: WorkerConfig) {}

  async getSnapshot(wallet: string): Promise<number> {
    const url = new URL(
      `${this.config.polymarket.dataApiBaseUrl.replace(/\/$/, '')}/v1/accounting/snapshot`,
    );
    url.searchParams.set('user', wallet);
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return 0;
    const payload: unknown = await response.json();
    if (payload && typeof payload === 'object') {
      const data = payload as Record<string, unknown>;
      const balance =
        data.balance ?? data.portfolioValue ?? data.totalValue ?? data.equity;
      if (typeof balance === 'number') return balance;
      if (typeof balance === 'string') return Number.parseFloat(balance) || 0;
    }
    return 0;
  }

  async getActivity(wallet: string): Promise<ActivityRow[]> {
    const url = new URL(
      `${this.config.polymarket.dataApiBaseUrl.replace(/\/$/, '')}/activity`,
    );
    url.searchParams.set('user', wallet);
    url.searchParams.set('limit', '500');
    return this.fetchArray(url.toString());
  }

  async getOpenPositions(wallet: string): Promise<OpenPositionApiRow[]> {
    const url = new URL(
      `${this.config.polymarket.dataApiBaseUrl.replace(/\/$/, '')}/positions`,
    );
    url.searchParams.set('user', wallet);
    url.searchParams.set('sortBy', 'CURRENT');
    url.searchParams.set('sortDirection', 'DESC');
    url.searchParams.set('sizeThreshold', '0.1');
    url.searchParams.set('limit', '500');
    url.searchParams.set('offset', '0');
    return this.fetchArray(url.toString());
  }

  async getClosedPositions(wallet: string): Promise<ClosedPositionApiRow[]> {
    const url = new URL(
      `${this.config.polymarket.dataApiBaseUrl.replace(/\/$/, '')}/closed-positions`,
    );
    url.searchParams.set('user', wallet);
    url.searchParams.set('sortBy', 'realizedpnl');
    url.searchParams.set('sortDirection', 'DESC');
    url.searchParams.set('limit', '500');
    url.searchParams.set('offset', '0');
    return this.fetchArray(url.toString());
  }

  private async fetchArray(url: string): Promise<Record<string, unknown>[]> {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return [];
    const payload: unknown = await response.json();
    if (Array.isArray(payload)) {
      return payload as Record<string, unknown>[];
    }
    if (payload && typeof payload === 'object') {
      const maybeData = payload as { data?: unknown; positions?: unknown };
      if (Array.isArray(maybeData.data)) {
        return maybeData.data as Record<string, unknown>[];
      }
      if (Array.isArray(maybeData.positions)) {
        return maybeData.positions as Record<string, unknown>[];
      }
    }
    return [];
  }
}
