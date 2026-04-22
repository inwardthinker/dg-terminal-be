import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { PortfolioService } from './portfolio.service';

@WebSocketGateway({
  namespace: '/portfolio-kpis',
  cors: { origin: '*' },
})
export class PortfolioKpisGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private static readonly ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
  private readonly logger = new Logger(PortfolioKpisGateway.name);
  private readonly kpiEmitIntervalMs: number;
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly portfolioService: PortfolioService,
    private readonly configService: ConfigService,
  ) {
    const configuredInterval = Number(
      this.configService.get<string>('PORTFOLIO_KPI_EMIT_INTERVAL_MS', '5000'),
    );
    this.kpiEmitIntervalMs =
      Number.isFinite(configuredInterval) && configuredInterval > 0
        ? configuredInterval
        : 5000;
  }

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    const wallet = this.extractWallet(client);
    if (!wallet) {
      this.logger.warn(
        `Rejected websocket client ${client.id}: invalid wallet`,
      );
      client.emit('error', { message: 'walletAddress is required' });
      client.disconnect(true);
      return;
    }

    await this.emitKpis(client, wallet);
    const timer = setInterval(() => {
      void this.emitKpis(client, wallet);
    }, this.kpiEmitIntervalMs);
    this.timers.set(client.id, timer);

    client.emit('subscribed', {
      stream: 'portfolio_kpis',
      wallet,
      interval_ms: this.kpiEmitIntervalMs,
    });
    this.logger.log(
      `Client connected for wallet ${wallet}; KPI stream interval=${this.kpiEmitIntervalMs}ms`,
    );
  }

  handleDisconnect(@ConnectedSocket() client: Socket): void {
    const timer = this.timers.get(client.id);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(client.id);
    }
    this.logger.log(`Client disconnected ${client.id}; KPI stream stopped`);
  }

  private async emitKpis(client: Socket, wallet: string): Promise<void> {
    try {
      const kpis = await this.portfolioService.getKpis(wallet);
      client.emit('kpi_update', {
        wallet,
        ts: new Date().toISOString(),
        kpis,
      });
    } catch (error) {
      this.logger.warn(
        `Failed streaming KPIs for wallet ${wallet}: ${error instanceof Error ? error.message : String(error)}`,
      );
      client.emit('kpi_update', {
        wallet,
        ts: new Date().toISOString(),
        kpis: {
          balance: 0,
          open_exposure: 0,
          pc_exposure: 0,
          unrealized_pnl: 0,
          un_pnl_pc: 0,
          realized_30d: 0,
          rewards_earned: 0,
          reward_pc: 0,
          num_trades: 0,
        },
      });
    }
  }

  private extractWallet(client: Socket): string | null {
    const authPayload = client.handshake.auth as
      | Record<string, unknown>
      | undefined;
    const fromAuthWallet = authPayload?.['walletAddress'];
    if (this.isValidAddress(fromAuthWallet)) {
      return fromAuthWallet.toLowerCase();
    }

    const fromAuthUser = authPayload?.['userAddress'];
    if (this.isValidAddress(fromAuthUser)) {
      return fromAuthUser.toLowerCase();
    }

    const queryPayload = client.handshake.query as Record<string, unknown>;
    const fromQueryWallet = queryPayload?.['walletAddress'];
    if (this.isValidAddress(fromQueryWallet)) {
      return fromQueryWallet.toLowerCase();
    }

    const fromQueryUser = queryPayload?.['userAddress'];
    if (this.isValidAddress(fromQueryUser)) {
      return fromQueryUser.toLowerCase();
    }

    return null;
  }

  private isValidAddress(value: unknown): value is string {
    return (
      typeof value === 'string' &&
      PortfolioKpisGateway.ADDRESS_REGEX.test(value)
    );
  }
}
