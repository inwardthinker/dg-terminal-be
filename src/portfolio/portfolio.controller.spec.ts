import { BadRequestException } from '@nestjs/common';
import { ClosePositionDto } from './dto/close-position.dto';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import {
  BalanceSnapshot,
  ClosePositionResult,
  PortfolioKpis,
} from './portfolio.types';

describe('PortfolioController', () => {
  const historyRows: BalanceSnapshot[] = [
    { date: '2026-04-20', balance_value: 101.11 },
    { date: '2026-04-21', balance_value: 102.22 },
    { date: '2026-04-22', balance_value: 103.33 },
  ];

  const fullCloseResult: ClosePositionResult = {
    realized_pnl: 12.5,
    closed_at: '2026-04-22T00:00:00.000Z',
  };
  const kpis: PortfolioKpis = {
    balance: 1000,
    open_exposure: 600,
    unrealized_pnl: 20,
    realized_30d: 15,
    rewards_earned: 3,
  };

  function buildController() {
    const service: Pick<
      PortfolioService,
      'getHistory' | 'closePosition' | 'getKpis'
    > = {
      getHistory: jest.fn().mockResolvedValue(historyRows),
      closePosition: jest.fn().mockResolvedValue(fullCloseResult),
      getKpis: jest.fn().mockResolvedValue(kpis),
    };
    const controller = new PortfolioController(service as PortfolioService);
    return { controller, service };
  }

  it('returns history for a valid period and userId', async () => {
    const { controller, service } = buildController();

    const result = await controller.getHistory('30d', '123');

    expect(result).toEqual(historyRows);
    expect(service.getHistory).toHaveBeenCalledWith('123', '30d');
  });

  it('throws when userId is missing for history', async () => {
    const { controller } = buildController();

    await expect(controller.getHistory('30d', '')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws when period is invalid for history', async () => {
    const { controller } = buildController();

    await expect(controller.getHistory('365d', '123')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns success payload for closePosition', async () => {
    const { controller, service } = buildController();
    const body: ClosePositionDto = { type: 'full' };

    const result = await controller.closePosition('asset-1', '123', body);

    expect(result).toEqual({
      success: true,
      realized_pnl: 12.5,
      closed_at: '2026-04-22T00:00:00.000Z',
    });
    expect(service.closePosition).toHaveBeenCalledWith('123', 'asset-1', {
      type: 'full',
    });
  });

  it('returns kpis for valid wallet', async () => {
    const { controller, service } = buildController();
    const wallet = '0x798a7921f5b2c684ecbaa7a6ae216a819fa6cc72';

    const result = await controller.getKpis(wallet);

    expect(result).toEqual(kpis);
    expect(service.getKpis).toHaveBeenCalledWith(wallet);
  });

  it('throws for invalid wallet on kpis endpoint', async () => {
    const { controller } = buildController();

    await expect(controller.getKpis('not-a-wallet')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
