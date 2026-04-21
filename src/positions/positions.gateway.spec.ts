import { PositionsGateway } from './positions.gateway';
import { PositionsPriceService } from './positions-price.service';

describe('PositionsGateway', () => {
  const subscribeUserMock = jest.fn();
  const mockPositionsPriceService = {
    subscribeUser: subscribeUserMock,
  } as unknown as PositionsPriceService;

  const createGateway = () => new PositionsGateway(mockPositionsPriceService);

  const createClient = (overrides?: {
    auth?: Record<string, unknown>;
    query?: Record<string, unknown>;
  }) => {
    return {
      id: 'socket-1',
      handshake: {
        auth: overrides?.auth ?? {},
        query: overrides?.query ?? {},
      },
      emit: jest.fn(),
      disconnect: jest.fn(),
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    subscribeUserMock.mockResolvedValue(jest.fn());
  });

  it('subscribes using userAddress from handshake auth', async () => {
    const gateway = createGateway();
    const client = createClient({
      auth: { userAddress: '0x1111111111111111111111111111111111111111' },
    });

    await gateway.handleConnection(client as never);

    expect(subscribeUserMock).toHaveBeenCalledWith(
      '0x1111111111111111111111111111111111111111',
      expect.any(Function),
    );
    expect(client.emit).toHaveBeenCalledWith('subscribed', {
      user: '0x1111111111111111111111111111111111111111',
    });
  });

  it('subscribes using walletAddress from handshake query fallback', async () => {
    const gateway = createGateway();
    const client = createClient({
      auth: {},
      query: { walletAddress: '0x2222222222222222222222222222222222222222' },
    });

    await gateway.handleConnection(client as never);

    expect(subscribeUserMock).toHaveBeenCalledWith(
      '0x2222222222222222222222222222222222222222',
      expect.any(Function),
    );
    expect(client.emit).toHaveBeenCalledWith('subscribed', {
      user: '0x2222222222222222222222222222222222222222',
    });
  });
});
