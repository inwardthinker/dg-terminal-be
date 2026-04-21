import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { PositionsPriceService } from './positions-price.service';

@WebSocketGateway({
  namespace: '/positions-prices',
  cors: { origin: '*' },
})
export class PositionsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private static readonly ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
  private readonly logger = new Logger(PositionsGateway.name);
  private readonly disconnectHandlers = new Map<string, () => void>();

  constructor(private readonly positionsPriceService: PositionsPriceService) {}

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    const userAddress = this.extractUserAddress(client);
    if (!userAddress) {
      this.logger.warn(
        `Rejected websocket client ${client.id}: missing auth.userAddress`,
      );
      client.emit('error', { message: 'Authentication required' });
      client.disconnect(true);
      return;
    }

    const unsubscribe = await this.positionsPriceService.subscribeUser(
      userAddress,
      (event) => {
        client.emit('position_price', event);
      },
    );

    this.disconnectHandlers.set(client.id, unsubscribe);
    client.emit('subscribed', { user: userAddress });
    this.logger.log(
      `Client connected for user ${userAddress}; subscription established`,
    );
  }

  handleDisconnect(@ConnectedSocket() client: Socket): void {
    const unsubscribe = this.disconnectHandlers.get(client.id);
    unsubscribe?.();
    this.disconnectHandlers.delete(client.id);
    this.logger.log(`Client disconnected ${client.id}; unsubscribed cleanly`);
  }

  private extractUserAddress(client: Socket): string | null {
    const authPayload = client.handshake.auth as
      | Record<string, unknown>
      | undefined;
    const fromAuth = authPayload?.['userAddress'];
    if (this.isValidAddress(fromAuth)) {
      return fromAuth.toLowerCase();
    }

    const fromWalletAuth = authPayload?.['walletAddress'];
    if (this.isValidAddress(fromWalletAuth)) {
      return fromWalletAuth.toLowerCase();
    }

    const queryPayload = client.handshake.query as Record<string, unknown>;
    const fromQueryUser = queryPayload?.['userAddress'];
    if (this.isValidAddress(fromQueryUser)) {
      return fromQueryUser.toLowerCase();
    }

    const fromQueryWallet = queryPayload?.['walletAddress'];
    if (this.isValidAddress(fromQueryWallet)) {
      return fromQueryWallet.toLowerCase();
    }

    return null;
  }

  private isValidAddress(value: unknown): value is string {
    return (
      typeof value === 'string' && PositionsGateway.ADDRESS_REGEX.test(value)
    );
  }
}
