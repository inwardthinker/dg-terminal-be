import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../../src/app.module';

type OpenPositionRow = {
  unrealized_pnl: number;
};

type OpenPositionsResponse = {
  positions: OpenPositionRow[];
};

type ClosedPositionsResponse = {
  closed_positions: Record<string, unknown>[];
};

type SummaryResponse = {
  summary: Record<string, unknown>;
};

type TradesResponse = {
  trades: unknown;
  page: number;
  per_page: number;
  total_count: number;
  total_pages: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toOpenPositionsResponse(value: unknown): OpenPositionsResponse {
  if (!isRecord(value) || !Array.isArray(value.positions)) {
    throw new Error('Invalid open positions response shape');
  }
  return { positions: value.positions as OpenPositionRow[] };
}

function toClosedPositionsResponse(value: unknown): ClosedPositionsResponse {
  if (!isRecord(value) || !Array.isArray(value.closed_positions)) {
    throw new Error('Invalid closed positions response shape');
  }
  return {
    closed_positions: value.closed_positions as Record<string, unknown>[],
  };
}

function toSummaryResponse(value: unknown): SummaryResponse {
  if (!isRecord(value) || !isRecord(value.summary)) {
    throw new Error('Invalid summary response shape');
  }
  return { summary: value.summary };
}

function toTradesResponse(value: unknown): TradesResponse {
  if (
    !isRecord(value) ||
    !('trades' in value) ||
    typeof value.page !== 'number' ||
    typeof value.per_page !== 'number' ||
    typeof value.total_count !== 'number' ||
    typeof value.total_pages !== 'number'
  ) {
    throw new Error('Invalid trades response shape');
  }
  return {
    trades: value.trades,
    page: value.page,
    per_page: value.per_page,
    total_count: value.total_count,
    total_pages: value.total_pages,
  };
}

function expectTypeOfField(
  row: Record<string, unknown>,
  key: string,
  expectedType: 'string' | 'number' | 'boolean',
): void {
  expect(typeof row[key]).toBe(expectedType);
}

describe('Portfolio Positions (e2e)', () => {
  let app: INestApplication<App>;
  const authHeader = { Authorization: 'Bearer e2e-token' };
  const wallet = '0x1111111111111111111111111111111111111111';

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );
    await app.init();
  });

  it('returns 401 when unauthenticated', async () => {
    await request(app.getHttpServer())
      .get('/api/portfolio/positions')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/portfolio/closed-positions')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/portfolio/summary')
      .expect(401);
    await request(app.getHttpServer()).get('/api/portfolio/trades').expect(401);
  });

  it('rejects invalid sort_dir', async () => {
    await request(app.getHttpServer())
      .get(`/api/portfolio/positions?wallet=${wallet}&sort_dir=downward`)
      .set(authHeader)
      .expect(400);
  });

  it('rejects invalid wallet query format', async () => {
    await request(app.getHttpServer())
      .get('/api/portfolio/positions?wallet=not-an-evm-address')
      .set(authHeader)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/portfolio/trades?wallet=not-an-evm-address')
      .set(authHeader)
      .expect(400);
  });

  it('rejects missing wallet query param', async () => {
    await request(app.getHttpServer())
      .get('/api/portfolio/positions')
      .set(authHeader)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/portfolio/closed-positions')
      .set(authHeader)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/portfolio/summary')
      .set(authHeader)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/portfolio/trades')
      .set(authHeader)
      .expect(400);
  });

  it('rejects invalid period for trades endpoint', async () => {
    await request(app.getHttpServer())
      .get(`/api/portfolio/trades?wallet=${wallet}&period=invalid`)
      .set(authHeader)
      .expect(400);
  });

  it('rejects invalid walletAddress format for summary endpoint', async () => {
    await request(app.getHttpServer())
      .get('/api/portfolio/summary?walletAddress=not-an-evm-address')
      .set(authHeader)
      .expect(400);
  });

  it('sorts by unrealized_pnl asc when requested', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/api/portfolio/positions?wallet=${wallet}&sort_by=unrealized_pnl&sort_dir=asc`,
      )
      .set(authHeader)
      .expect(200);
    const body = toOpenPositionsResponse(response.body as unknown);

    const pnls = body.positions.map((position) => position.unrealized_pnl);

    if (pnls.length >= 2) {
      expect(pnls).toEqual([...pnls].sort((a: number, b: number) => a - b));
    }
  });

  it('returns 200 and positions shape when authenticated', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/portfolio/positions?wallet=${wallet}`)
      .set(authHeader)
      .expect(200);
    const body = toOpenPositionsResponse(response.body as unknown);

    expect(Array.isArray(body.positions)).toBe(true);
    if (body.positions.length > 0) {
      const row = body.positions[0] as unknown;
      expect(isRecord(row)).toBe(true);
      if (!isRecord(row)) {
        throw new Error('positions[0] is not an object');
      }

      expectTypeOfField(row, 'market_name', 'string');
      expectTypeOfField(row, 'category', 'string');
      expectTypeOfField(row, 'venue', 'string');
      expectTypeOfField(row, 'side', 'string');
      expectTypeOfField(row, 'avg_entry_price', 'number');
      expectTypeOfField(row, 'current_price', 'number');
      expectTypeOfField(row, 'shares', 'number');
      expectTypeOfField(row, 'cost_basis', 'number');
      expectTypeOfField(row, 'unrealized_pnl', 'number');
      expectTypeOfField(row, 'unrealized_pnl_pct', 'number');
      expectTypeOfField(row, 'exposure', 'number');
      expectTypeOfField(row, 'condition_id', 'string');
      expectTypeOfField(row, 'outcome_token_id', 'string');
      expectTypeOfField(row, 'slug', 'string');
      expectTypeOfField(row, 'icon', 'string');
      expectTypeOfField(row, 'redeemable', 'boolean');
      expectTypeOfField(row, 'mergeable', 'boolean');
      expectTypeOfField(row, 'negative_risk', 'boolean');
      expectTypeOfField(row, 'percent_pnl', 'number');
    }
  });

  it('returns 200 and closed_positions shape when authenticated', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/portfolio/closed-positions?wallet=${wallet}`)
      .set(authHeader)
      .expect(200);
    const body = toClosedPositionsResponse(response.body as unknown);

    expect(Array.isArray(body.closed_positions)).toBe(true);
    if (body.closed_positions.length > 0) {
      const row = body.closed_positions[0] as unknown;
      expect(isRecord(row)).toBe(true);
      if (!isRecord(row)) {
        throw new Error('closed_positions[0] is not an object');
      }

      expectTypeOfField(row, 'market_name', 'string');
      expectTypeOfField(row, 'category', 'string');
      expectTypeOfField(row, 'venue', 'string');
      expectTypeOfField(row, 'side', 'string');
      expectTypeOfField(row, 'avg_entry_price', 'number');
      expectTypeOfField(row, 'current_price', 'number');
      expectTypeOfField(row, 'shares', 'number');
      expectTypeOfField(row, 'cost_basis', 'number');
      expectTypeOfField(row, 'realized_pnl', 'number');
      expectTypeOfField(row, 'realized_pnl_pct', 'number');
      expectTypeOfField(row, 'end_date', 'string');
      expectTypeOfField(row, 'closed_at', 'string');
      expectTypeOfField(row, 'condition_id', 'string');
      expectTypeOfField(row, 'outcome_token_id', 'string');
      expectTypeOfField(row, 'slug', 'string');
      expectTypeOfField(row, 'icon', 'string');
      expectTypeOfField(row, 'event_slug', 'string');
      expectTypeOfField(row, 'outcome_index', 'number');
    }
  });

  it('returns 200 and summary shape when authenticated', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/portfolio/summary?walletAddress=${wallet}`)
      .set(authHeader)
      .expect(200);
    const body = toSummaryResponse(response.body as unknown);

    expectTypeOfField(body.summary, 'balance', 'number');
    expectTypeOfField(body.summary, 'open_exposure', 'number');
    expectTypeOfField(body.summary, 'unrealized_pnl', 'number');
    expectTypeOfField(body.summary, 'realized_30d', 'number');
    expectTypeOfField(body.summary, 'rewards_earned', 'number');
    expect(
      body.summary.rewards_pct_of_pnl === null ||
        typeof body.summary.rewards_pct_of_pnl === 'number',
    ).toBe(true);
    expect(
      body.summary.deployment_rate_pct === null ||
        typeof body.summary.deployment_rate_pct === 'number',
    ).toBe(true);
    expect(
      body.summary.balance_last_updated === null ||
        typeof body.summary.balance_last_updated === 'string',
    ).toBe(true);
    expect(
      body.summary.open_exposure_last_updated === null ||
        typeof body.summary.open_exposure_last_updated === 'string',
    ).toBe(true);
    expect(
      body.summary.unrealized_pnl_last_updated === null ||
        typeof body.summary.unrealized_pnl_last_updated === 'string',
    ).toBe(true);
    expect(
      body.summary.realized_30d_last_updated === null ||
        typeof body.summary.realized_30d_last_updated === 'string',
    ).toBe(true);
    expect(
      body.summary.rewards_last_updated === null ||
        typeof body.summary.rewards_last_updated === 'string',
    ).toBe(true);
  });

  it('returns 200 and trades wrapper shape when authenticated', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/api/portfolio/trades?wallet=${wallet}&period=7d&page=1&sort_by=created_at&sort_dir=desc`,
      )
      .set(authHeader)
      .expect(200);
    const body = toTradesResponse(response.body as unknown);
    expect(body).toHaveProperty('trades');
    expect(typeof body.page).toBe('number');
    expect(typeof body.per_page).toBe('number');
    expect(typeof body.total_count).toBe('number');
    expect(typeof body.total_pages).toBe('number');
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });
});
