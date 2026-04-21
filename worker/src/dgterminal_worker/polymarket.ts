import { WorkerConfig } from './config';
import { inflateRawSync } from 'node:zlib';

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

    const contentType =
      response.headers?.get('content-type')?.toLowerCase() ?? '';
    const bodyBytes = Buffer.from(await response.arrayBuffer());

    if (
      contentType.includes('application/zip') ||
      contentType.includes('application/octet-stream') ||
      isZipArchive(bodyBytes)
    ) {
      return parseSnapshotBalanceFromZip(bodyBytes);
    }

    const payload: unknown = JSON.parse(bodyBytes.toString('utf8'));
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

function isZipArchive(bytes: Buffer): boolean {
  return bytes.length >= 4 && bytes.readUInt32LE(0) === 0x04034b50;
}

function parseSnapshotBalanceFromZip(zipBytes: Buffer): number {
  const file = readZipFile(zipBytes, 'equity.csv');
  if (!file) return 0;
  return parseBalanceFromEquityCsv(file.toString('utf8'));
}

function parseBalanceFromEquityCsv(csvText: string): number {
  const normalized = csvText.replace(/\r/g, '').trim();
  if (!normalized) return 0;
  const lines = normalized.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length === 0) return 0;

  const firstDataLine = lines.length >= 2 ? lines[1] : lines[0];
  const columns = firstDataLine.split(',').map((column) => column.trim());
  for (const column of columns) {
    const numeric = toNumber(column);
    if (numeric !== 0 || /^[-+]?0*\.?0+$/.test(column)) {
      return numeric;
    }
  }
  return 0;
}

function readZipFile(zipBytes: Buffer, fileName: string): Buffer | null {
  const eocdOffset = zipBytes.lastIndexOf(
    Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  );
  if (eocdOffset < 0 || eocdOffset + 22 > zipBytes.length) return null;

  const centralDirectoryOffset = zipBytes.readUInt32LE(eocdOffset + 16);
  const entries = zipBytes.readUInt16LE(eocdOffset + 10);

  let cursor = centralDirectoryOffset;
  for (let i = 0; i < entries; i += 1) {
    if (cursor + 46 > zipBytes.length) return null;
    if (zipBytes.readUInt32LE(cursor) !== 0x02014b50) return null;

    const compressionMethod = zipBytes.readUInt16LE(cursor + 10);
    const compressedSize = zipBytes.readUInt32LE(cursor + 20);
    const fileNameLength = zipBytes.readUInt16LE(cursor + 28);
    const extraLength = zipBytes.readUInt16LE(cursor + 30);
    const commentLength = zipBytes.readUInt16LE(cursor + 32);
    const localHeaderOffset = zipBytes.readUInt32LE(cursor + 42);
    const entryNameStart = cursor + 46;
    const entryNameEnd = entryNameStart + fileNameLength;
    if (entryNameEnd > zipBytes.length) return null;

    const entryName = zipBytes.toString('utf8', entryNameStart, entryNameEnd);
    if (entryName === fileName) {
      if (localHeaderOffset + 30 > zipBytes.length) return null;
      if (zipBytes.readUInt32LE(localHeaderOffset) !== 0x04034b50) return null;

      const localNameLength = zipBytes.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = zipBytes.readUInt16LE(localHeaderOffset + 28);
      const dataStart =
        localHeaderOffset + 30 + localNameLength + localExtraLength;
      const dataEnd = dataStart + compressedSize;
      if (dataEnd > zipBytes.length) return null;

      const compressedData = zipBytes.subarray(dataStart, dataEnd);
      if (compressionMethod === 0) {
        return Buffer.from(compressedData);
      }
      if (compressionMethod === 8) {
        return inflateRawSync(compressedData);
      }
      return null;
    }

    cursor = entryNameEnd + extraLength + commentLength;
  }

  return null;
}
