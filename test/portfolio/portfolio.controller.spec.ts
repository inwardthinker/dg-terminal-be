import { BadRequestException } from '@nestjs/common';
import { PortfolioController } from '../../src/portfolio/portfolio.controller';
import { PortfolioService } from '../../src/portfolio/portfolio.service';

const mockGetHistory = jest.fn().mockResolvedValue([
  { date: '2026-04-08', balance_value: 17690.11 },
  { date: '2026-04-09', balance_value: 17705.42 },
  { date: '2026-04-10', balance_value: 17733.0 },
]);

function makeMockService() {
  return { getHistory: mockGetHistory } as unknown as PortfolioService;
}

describe('PortfolioController', () => {
  beforeEach(() => {
    mockGetHistory.mockClear();
  });

  it('returns snapshots for a valid request', async () => {
    const controller = new PortfolioController(makeMockService());

    const result = await controller.getHistory('7d', '1878');

    expect(mockGetHistory).toHaveBeenCalledWith('1878', '7d');
    expect(result).toHaveLength(3);
  });

  it('throws BadRequestException when userId is missing', async () => {
    const controller = new PortfolioController(makeMockService());

    await expect(controller.getHistory('7d', '')).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      controller.getHistory('7d', undefined as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when period is missing', async () => {
    const controller = new PortfolioController(makeMockService());

    await expect(controller.getHistory('', '1878')).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      controller.getHistory(undefined as any, '1878'),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException for invalid period value', async () => {
    const controller = new PortfolioController(makeMockService());

    await expect(controller.getHistory('5d', '1878')).rejects.toThrow(
      BadRequestException,
    );
    await expect(controller.getHistory('1y', '1878')).rejects.toThrow(
      BadRequestException,
    );
  });

  it.each(['7d', '30d', '90d', 'all'] as const)(
    'accepts valid period "%s"',
    async (period) => {
      const controller = new PortfolioController(makeMockService());

      await controller.getHistory(period, '1878');

      expect(mockGetHistory).toHaveBeenCalledWith('1878', period);
    },
  );
});
