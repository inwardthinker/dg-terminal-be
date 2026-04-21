import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { PolymarketDataApi } from './polymarket';
import type { WorkerConfig } from './config';

function createConfig(): WorkerConfig {
  return {
    db: {
      host: 'localhost',
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: 'postgres',
    },
    polymarket: {
      dataApiBaseUrl: 'https://data-api.test',
      gammaBaseUrl: 'https://gamma-api.test',
      clobWsUrl: 'wss://ws-subscriptions-clob.polymarket.com/ws/market',
    },
    intervalsMs: {
      loopA: 10_000,
      loopB: 30_000,
      loopC: 60_000,
      loopD: 300_000,
    },
  };
}

test('getSnapshot returns numeric balance from snapshot payload', async () => {
  const api = new PolymarketDataApi(createConfig());
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    ({
      ok: true,
      headers: { get: () => 'application/json' },
      arrayBuffer: async () => {
        const payload = Buffer.from(JSON.stringify({ balance: '123.45' }));
        return payload.buffer.slice(
          payload.byteOffset,
          payload.byteOffset + payload.byteLength,
        );
      },
    }) as unknown as Response) as typeof fetch;

  try {
    const balance = await api.getSnapshot('0xabc');
    assert.equal(balance, 123.45);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('getSnapshot parses balance from zipped equity.csv payload', async () => {
  const api = new PolymarketDataApi(createConfig());
  const originalFetch = globalThis.fetch;
  const zipPayload = createZipWithSingleDeflatedFile(
    'equity.csv',
    'timestamp,equity\n2026-04-21T00:00:00Z,456.78\n',
  );

  globalThis.fetch = (async () =>
    ({
      ok: true,
      headers: { get: () => 'application/octet-stream' },
      arrayBuffer: async () =>
        zipPayload.buffer.slice(
          zipPayload.byteOffset,
          zipPayload.byteOffset + zipPayload.byteLength,
        ),
    }) as unknown as Response) as typeof fetch;

  try {
    const balance = await api.getSnapshot('0xabc');
    assert.equal(balance, 456.78);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('getOpenPositions supports object payload with data array', async () => {
  const api = new PolymarketDataApi(createConfig());
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        data: [{ conditionId: 'cond-1', size: '10', curPrice: '0.5' }],
      }),
    }) as Response) as typeof fetch;

  try {
    const rows = await api.getOpenPositions('0xabc');
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.conditionId, 'cond-1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('getClosedPositions supports object payload with positions array', async () => {
  const api = new PolymarketDataApi(createConfig());
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        positions: [{ conditionId: 'cond-2', realizedPnl: '5' }],
      }),
    }) as Response) as typeof fetch;

  try {
    const rows = await api.getClosedPositions('0xabc');
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.conditionId, 'cond-2');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function createZipWithSingleDeflatedFile(
  fileName: string,
  fileText: string,
): Buffer {
  const fileNameBytes = Buffer.from(fileName, 'utf8');
  const fileBytes = Buffer.from(fileText, 'utf8');
  const compressed = deflateRawSync(fileBytes);

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(8, 8);
  localHeader.writeUInt16LE(0, 10);
  localHeader.writeUInt16LE(0, 12);
  localHeader.writeUInt32LE(0, 14);
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(fileBytes.length, 22);
  localHeader.writeUInt16LE(fileNameBytes.length, 26);
  localHeader.writeUInt16LE(0, 28);

  const localFileStart = 0;
  const fileSection = Buffer.concat([localHeader, fileNameBytes, compressed]);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0, 8);
  centralHeader.writeUInt16LE(8, 10);
  centralHeader.writeUInt16LE(0, 12);
  centralHeader.writeUInt16LE(0, 14);
  centralHeader.writeUInt32LE(0, 16);
  centralHeader.writeUInt32LE(compressed.length, 20);
  centralHeader.writeUInt32LE(fileBytes.length, 24);
  centralHeader.writeUInt16LE(fileNameBytes.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE(0, 38);
  centralHeader.writeUInt32LE(localFileStart, 42);

  const centralDirectory = Buffer.concat([centralHeader, fileNameBytes]);
  const centralDirectoryOffset = fileSection.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(centralDirectoryOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([fileSection, centralDirectory, eocd]);
}
