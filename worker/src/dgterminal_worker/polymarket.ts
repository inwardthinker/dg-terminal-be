import { WorkerConfig } from './config';

export type OpenPositionApiRow = Record<string, unknown>;
export type ClosedPositionApiRow = Record<string, unknown>;
export type ActivityRow = Record<string, unknown>;

export class PolymarketDataApi {
  private readonly dataApiBaseUrl: string;
  private static readonly REQUEST_TIMEOUT_MS = 15_000;

  constructor(private readonly config: WorkerConfig) {
    this.dataApiBaseUrl = this.config.polymarket.dataApiBaseUrl.replace(
      /\/$/,
      '',
    );
  }

  async getSnapshot(wallet: string): Promise<number> {
    const url = this.buildUrl('/v1/accounting/snapshot', { user: wallet });
    const response = await fetch(url.toString(), this.requestInit());
    if (!response.ok) return 0;

    const payload: unknown = await response.json();
    if (!isRecord(payload)) return 0;

    const balance =
      payload.balance ??
      payload.portfolioValue ??
      payload.totalValue ??
      payload.equity;
    return toNumber(balance);
  }

  async getActivity(wallet: string): Promise<ActivityRow[]> {
    const url = this.buildUrl('/activity', {
      user: wallet,
      limit: '500',
    });
    return this.fetchArray(url.toString());
  }

  async getOpenPositions(wallet: string): Promise<OpenPositionApiRow[]> {
    const url = this.buildUrl('/positions', {
      user: wallet,
      sortBy: 'CURRENT',
      sortDirection: 'DESC',
      sizeThreshold: '0.1',
      limit: '500',
      offset: '0',
    });
    return this.fetchArray(url.toString());
  }

  async getClosedPositions(wallet: string): Promise<ClosedPositionApiRow[]> {
    const url = this.buildUrl('/closed-positions', {
      user: wallet,
      sortBy: 'realizedpnl',
      sortDirection: 'DESC',
      limit: '500',
      offset: '0',
    });
    return this.fetchArray(url.toString());
  }

  private buildUrl(path: string, query: Record<string, string>): URL {
    const url = new URL(`${this.dataApiBaseUrl}${path}`);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
    return url;
  }

  private requestInit(): RequestInit {
    return {
      signal: AbortSignal.timeout(PolymarketDataApi.REQUEST_TIMEOUT_MS),
    };
  }

  private async fetchArray(url: string): Promise<Record<string, unknown>[]> {
    const response = await fetch(url, this.requestInit());
    if (!response.ok) return [];

    const payload: unknown = await response.json();
    if (Array.isArray(payload)) {
      return payload as Record<string, unknown>[];
    }
    if (!isRecord(payload)) return [];

    if (Array.isArray(payload.data)) {
      return payload.data as Record<string, unknown>[];
    }
    if (Array.isArray(payload.positions)) {
      return payload.positions as Record<string, unknown>[];
    }
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
