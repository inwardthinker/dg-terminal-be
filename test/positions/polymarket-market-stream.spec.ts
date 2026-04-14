import { PolymarketMarketStreamService } from '../../src/positions/polymarket-market-stream.service';

describe('PolymarketMarketStreamService', () => {
  it('uses reconnect backoff sequence 1s, 2s, 4s, 8s, 16s max', () => {
    expect([
      PolymarketMarketStreamService.getReconnectDelayMs(0),
      PolymarketMarketStreamService.getReconnectDelayMs(1),
      PolymarketMarketStreamService.getReconnectDelayMs(2),
      PolymarketMarketStreamService.getReconnectDelayMs(3),
      PolymarketMarketStreamService.getReconnectDelayMs(4),
      PolymarketMarketStreamService.getReconnectDelayMs(5),
    ]).toEqual([1000, 2000, 4000, 8000, 16000, 16000]);
  });
});
