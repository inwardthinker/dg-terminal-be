import { BadRequestException } from '@nestjs/common';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';

describe('PortfolioController history endpoint', () => {
  it('throws when userId is missing', () => {
    const service = {
      getHistory: jest.fn(),
    } as unknown as PortfolioService;
    const controller = new PortfolioController(service);

    expect(() => controller.getHistory('7d', '')).toThrow(BadRequestException);
    expect(() => controller.getHistory('7d', '')).toThrow('userId is required');
  });

  it('throws when period is invalid', () => {
    const service = {
      getHistory: jest.fn(),
    } as unknown as PortfolioService;
    const controller = new PortfolioController(service);

    expect(() => controller.getHistory('1d', '123')).toThrow(
      BadRequestException,
    );
  });

  it('delegates valid requests to service', async () => {
    const historyResponse = {
      userId: 123,
      asOfDate: '2026-01-01',
      points: [{ date: '2026-01-01', balanceValue: 42, dailyChange: 0 }],
      ranges: {
        '7d': {
          startIndex: 0,
          endIndex: 0,
          pointsCount: 1,
          insufficientHistory: true,
          startValue: 42,
          endValue: 42,
          changePct: 0,
        },
        '30d': {
          startIndex: 0,
          endIndex: 0,
          pointsCount: 1,
          insufficientHistory: true,
          startValue: 42,
          endValue: 42,
          changePct: 0,
        },
        '90d': {
          startIndex: 0,
          endIndex: 0,
          pointsCount: 1,
          insufficientHistory: true,
          startValue: 42,
          endValue: 42,
          changePct: 0,
        },
        all: {
          startIndex: 0,
          endIndex: 0,
          pointsCount: 1,
          insufficientHistory: false,
          startValue: 42,
          endValue: 42,
          changePct: 0,
        },
      },
    };
    const getHistoryMock = jest.fn().mockResolvedValue(historyResponse);
    const service = {
      getHistory: getHistoryMock,
    } as unknown as PortfolioService;
    const controller = new PortfolioController(service);

    await expect(controller.getHistory('30d', '123')).resolves.toEqual(
      historyResponse,
    );
    expect(getHistoryMock).toHaveBeenCalledWith('123', '30d');
  });
});
