import { PortfolioClosedPositionsRepository } from './portfolio-closed-positions.repository';
import { PortfolioPositionsRepository } from './portfolio-positions.repository';

type MockPool = {
  query: jest.Mock;
};

describe('Portfolio repositories sort mappings', () => {
  it('maps open positions outcome_token_id sort to asset column', async () => {
    const pool: MockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };
    const repo = new PortfolioPositionsRepository(pool as never);

    await repo.findByWallet({
      wallet: '0x1111111111111111111111111111111111111111',
      sort_by: 'outcome_token_id',
      sort_dir: 'asc',
    });

    const firstCall = pool.query.mock.calls[0] as unknown[] | undefined;
    const sql = (firstCall?.[0] as string | undefined) ?? '';
    expect(sql).toContain('ORDER BY asset ASC');
  });

  it('maps closed positions closed_at sort to trade_time column', async () => {
    const pool: MockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };
    const repo = new PortfolioClosedPositionsRepository(pool as never);

    await repo.findByWallet({
      wallet: '0x1111111111111111111111111111111111111111',
      sort_by: 'closed_at',
      sort_dir: 'desc',
    });

    const firstCall = pool.query.mock.calls[0] as unknown[] | undefined;
    const sql = (firstCall?.[0] as string | undefined) ?? '';
    expect(sql).toContain('ORDER BY trade_time DESC');
  });
});
