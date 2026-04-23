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
    const snapshots = [{ date: '2026-01-01', balance_value: 42 }];
    const getHistoryMock = jest.fn().mockResolvedValue(snapshots);
    const service = {
      getHistory: getHistoryMock,
    } as unknown as PortfolioService;
    const controller = new PortfolioController(service);

    await expect(controller.getHistory('30d', '123')).resolves.toEqual(
      snapshots,
    );
    expect(getHistoryMock).toHaveBeenCalledWith('123', '30d');
  });
});
