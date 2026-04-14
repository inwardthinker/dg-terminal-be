import { PositionsGateway } from '../../src/positions/positions.gateway';
import { PositionPriceEvent } from '../../src/positions/positions.types';

type MockSocket = {
  id: string;
  handshake: {
    auth?: Record<string, unknown>;
    headers: Record<string, unknown>;
  };
  emit: (event: string, payload: unknown) => void;
  disconnect: (close?: boolean) => void;
};

describe('PositionsGateway', () => {
  it('establishes subscription when screen opens (socket connection)', async () => {
    const subscribeUser = jest
      .fn<Promise<() => void>, [string, (event: PositionPriceEvent) => void]>()
      .mockResolvedValue(() => undefined);
    const gateway = new PositionsGateway({ subscribeUser } as never);

    const emitMock = jest.fn<void, [string, unknown]>();
    const disconnectMock = jest.fn<void, [boolean?]>();
    const client: MockSocket = {
      id: 'client-0',
      handshake: {
        auth: { userAddress: '0x798a7921f5b2c684ecbaa7a6ae216a819fa6cc72' },
        headers: {},
      },
      emit: emitMock,
      disconnect: disconnectMock,
    };

    await gateway.handleConnection(client as never);

    expect(subscribeUser).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith('subscribed', {
      user: '0x798a7921f5b2c684ecbaa7a6ae216a819fa6cc72',
    });
    expect(disconnectMock).not.toHaveBeenCalled();
  });

  it('rejects connection when user address is invalid', async () => {
    const subscribeUser = jest
      .fn<Promise<() => void>, [string, (event: PositionPriceEvent) => void]>()
      .mockResolvedValue(() => undefined);
    const gateway = new PositionsGateway({ subscribeUser } as never);

    const emitMock = jest.fn<void, [string, unknown]>();
    const disconnectMock = jest.fn<void, [boolean?]>();
    const client: MockSocket = {
      id: 'client-1',
      handshake: {
        auth: { userAddress: 'bad-address' },
        headers: {},
      },
      emit: emitMock,
      disconnect: disconnectMock,
    };

    await gateway.handleConnection(client as never);

    expect(subscribeUser).not.toHaveBeenCalled();
    expect(emitMock).toHaveBeenCalledWith('error', {
      message: 'Authentication required',
    });
    expect(disconnectMock).toHaveBeenCalledWith(true);
  });

  it('unsubscribes on client disconnect', async () => {
    const unsubscribe = jest.fn();
    const subscribeUser = jest
      .fn<Promise<() => void>, [string, (event: PositionPriceEvent) => void]>()
      .mockResolvedValue(unsubscribe);
    const gateway = new PositionsGateway({ subscribeUser } as never);

    const emitMock = jest.fn<void, [string, unknown]>();
    const disconnectMock = jest.fn<void, [boolean?]>();
    const client: MockSocket = {
      id: 'client-2',
      handshake: {
        auth: { userAddress: '0x798a7921f5b2c684ecbaa7a6ae216a819fa6cc72' },
        headers: {},
      },
      emit: emitMock,
      disconnect: disconnectMock,
    };

    await gateway.handleConnection(client as never);
    gateway.handleDisconnect(client as never);

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('rejects connection when address only exists in headers', async () => {
    const subscribeUser = jest
      .fn<Promise<() => void>, [string, (event: PositionPriceEvent) => void]>()
      .mockResolvedValue(() => undefined);
    const gateway = new PositionsGateway({ subscribeUser } as never);

    const emitMock = jest.fn<void, [string, unknown]>();
    const disconnectMock = jest.fn<void, [boolean?]>();
    const client: MockSocket = {
      id: 'client-3',
      handshake: {
        headers: {
          'x-user-address': '0x798a7921f5b2c684ecbaa7a6ae216a819fa6cc72',
        },
      },
      emit: emitMock,
      disconnect: disconnectMock,
    };

    await gateway.handleConnection(client as never);

    expect(subscribeUser).not.toHaveBeenCalled();
    expect(emitMock).toHaveBeenCalledWith('error', {
      message: 'Authentication required',
    });
    expect(disconnectMock).toHaveBeenCalledWith(true);
  });
});
