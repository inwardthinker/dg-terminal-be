import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BalanceSnapshot,
  EquityCurveResponse,
  HistoryPeriod,
} from './portfolio.types';

@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);
  private readonly apiUrl: string;
  private readonly totpCode: string;
  private readonly totpTimestamp: string;

  constructor(private readonly configService: ConfigService) {
    this.apiUrl = this.configService.getOrThrow<string>('EQUITY_CURVE_API_URL');
    this.totpCode = this.configService.getOrThrow<string>('TOTP_CODE');
    this.totpTimestamp =
      this.configService.getOrThrow<string>('TOTP_TIMESTAMP');
  }

  async getHistory(
    userId: string,
    period: HistoryPeriod,
  ): Promise<BalanceSnapshot[]> {
    const data = await this.fetchEquityCurve(userId);
    const range = data.ranges[period];

    if (!range || range.pointsCount < 3) {
      return [];
    }

    const slice = data.points.slice(range.startIndex, range.endIndex + 1);

    return this.fillGaps(slice);
  }

  private async fetchEquityCurve(userId: string): Promise<EquityCurveResponse> {
    const url = `${this.apiUrl}?userId=${userId}`;

    const response = await fetch(url, {
      headers: {
        'X-TOTP-Code': this.totpCode,
        'X-TOTP-Timestamp': this.totpTimestamp,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      this.logger.error(`Equity curve request failed: ${response.status}`);
      throw new Error(`Equity curve request failed: ${response.status}`);
    }

    return (await response.json()) as EquityCurveResponse;
  }

  /**
   * Fills date gaps by carrying forward the last known balance value.
   * The upstream API may omit no-activity days.
   */
  private fillGaps(
    points: { date: string; balanceValue: number }[],
  ): BalanceSnapshot[] {
    if (points.length === 0) return [];

    const result: BalanceSnapshot[] = [];
    const start = new Date(points[0].date);
    const end = new Date(points[points.length - 1].date);

    const pointMap = new Map<string, number>();
    for (const p of points) {
      pointMap.set(p.date, p.balanceValue);
    }

    let lastBalance = points[0].balanceValue;
    const current = new Date(start);

    while (current <= end) {
      const dateStr = current.toISOString().slice(0, 10);
      const balance = pointMap.get(dateStr) ?? lastBalance;
      lastBalance = balance;
      result.push({ date: dateStr, balance_value: balance });
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return result;
  }
}
