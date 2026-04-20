import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PortfolioController } from '../../src/portfolio/portfolio.controller';
import { PortfolioService } from '../../src/portfolio/portfolio.service';

const mockGetHistory = jest.fn().mockResolvedValue([
  { date: '2026-04-08', balance_value: 17690.11 },
  { date: '2026-04-09', balance_value: 17705.42 },
  { date: '2026-04-10', balance_value: 17733.0 },
]);
const mockClosePosition = jest.fn();

function makeMockService() {
  return {
    getHistory: mockGetHistory,
    closePosition: mockClosePosition,
  } as unknown as PortfolioService;
}

describe('PortfolioController', () => {
  beforeEach(() => {
    mockGetHistory.mockClear();
    mockClosePosition.mockClear();
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

  it('closes a full position and returns pnl/closed_at', async () => {
    mockClosePosition.mockResolvedValue({
      realized_pnl: 18.2,
      closed_at: '2026-04-17T00:00:00.000Z',
    });
    const controller = new PortfolioController(makeMockService());

    const result = await controller.closePosition('asset-1', '1878', {
      type: 'full',
    });

    expect(mockClosePosition).toHaveBeenCalledWith('1878', 'asset-1', {
      type: 'full',
    });
    expect(result).toEqual({
      success: true,
      realized_pnl: 18.2,
      closed_at: '2026-04-17T00:00:00.000Z',
    });
  });

  it('closes a partial position and returns remaining_size and avg_entry_price', async () => {
    mockClosePosition.mockResolvedValue({
      realized_pnl: 7.5,
      remaining_size: 40,
      avg_entry_price: 0.61,
    });
    const controller = new PortfolioController(makeMockService());

    const result = await controller.closePosition('asset-1', '1878', {
      type: 'partial',
      percentage: 60,
    });

    expect(result).toEqual({
      success: true,
      realized_pnl: 7.5,
      remaining_size: 40,
      avg_entry_price: 0.61,
    });
  });

  it('throws BadRequestException when userId is missing for close', async () => {
    const controller = new PortfolioController(makeMockService());

    await expect(
      controller.closePosition('asset-1', '', { type: 'full' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('maps not found and conflict errors for close', async () => {
    const controller = new PortfolioController(makeMockService());
    mockClosePosition.mockRejectedValueOnce(
      new NotFoundException({ code: 'POSITION_NOT_FOUND', message: 'missing' }),
    );
    mockClosePosition.mockRejectedValueOnce(
      new ConflictException({
        code: 'POSITION_ALREADY_CLOSED',
        message: 'done',
      }),
    );

    await expect(
      controller.closePosition('asset-1', '1878', { type: 'full' }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.closePosition('asset-1', '1878', { type: 'full' }),
    ).rejects.toThrow(ConflictException);
  });
});
