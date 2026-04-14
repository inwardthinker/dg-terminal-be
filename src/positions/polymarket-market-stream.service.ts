import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import WebSocket from 'ws';
import { MarketPriceUpdate } from './positions.types';

type PriceListener = (update: MarketPriceUpdate) => void;

interface SubscriptionRequest {
  assets_ids: string[];
  type: 'market';
  custom_feature_enabled: boolean;
}

interface SubscriptionUpdateRequest {
  operation: 'subscribe' | 'unsubscribe';
  assets_ids: string[];
}

type MarketEvent = Record<string, unknown>;

@Injectable()
export class PolymarketMarketStreamService implements OnModuleDestroy {
  private readonly logger = new Logger(PolymarketMarketStreamService.name);
  private readonly wsUrl =
    'wss://ws-subscriptions-clob.polymarket.com/ws/market';
  private readonly listeners = new Map<string, Set<PriceListener>>();
  private readonly latestPrices = new Map<string, number>();
  private readonly subscribedAssets = new Set<string>();
  private reconnectAttempt = 0;
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;

  static getReconnectDelayMs(attempt: number): number {
    const baseDelay = 1000 * 2 ** attempt;
    return Math.min(baseDelay, 16000);
  }

  getLastPrice(assetId: string): number | undefined {
    return this.latestPrices.get(assetId);
  }

  subscribe(assetIds: string[], listener: PriceListener): () => void {
    assetIds.forEach((assetId) => {
      const existingListeners =
        this.listeners.get(assetId) ?? new Set<PriceListener>();
      existingListeners.add(listener);
      this.listeners.set(assetId, existingListeners);
    });

    this.connectIfNeeded();
    this.subscribeAssets(assetIds);
    this.logger.log(
      `Attached listener for ${assetIds.length} asset subscriptions`,
    );

    return () => {
      const noListenersAssets: string[] = [];
      assetIds.forEach((assetId) => {
        const existingListeners = this.listeners.get(assetId);
        if (!existingListeners) {
          return;
        }
        existingListeners.delete(listener);
        if (existingListeners.size === 0) {
          this.listeners.delete(assetId);
          noListenersAssets.push(assetId);
        }
      });

      if (noListenersAssets.length > 0) {
        this.unsubscribeAssets(noListenersAssets);
      }
      this.logger.log(
        `Detached listener; unsubscribed ${noListenersAssets.length} assets with no remaining subscribers`,
      );
    };
  }

  onModuleDestroy(): void {
    this.clearTimers();
    this.ws?.close();
    this.ws = null;
  }

  private connectIfNeeded(): void {
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      return;
    }

    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      this.logger.log('Connected to Polymarket market stream');
      this.reconnectAttempt = 0;
      this.sendInitialSubscription();
      this.startHeartbeat();
    });

    this.ws.on('message', (data) => {
      if (typeof data === 'string') {
        this.handleMessage(data);
        return;
      }

      if (data instanceof Buffer) {
        this.handleMessage(data.toString('utf8'));
      }
    });

    this.ws.on('close', () => {
      this.logger.warn('Polymarket market stream closed');
      this.markAllAssetsStale();
      this.clearHeartbeat();
      this.ws = null;
      this.scheduleReconnect();
    });

    this.ws.on('error', (error) => {
      this.logger.error(`Polymarket market stream error: ${error.message}`);
    });
  }

  private sendInitialSubscription(): void {
    if (this.subscribedAssets.size === 0) {
      return;
    }

    const payload: SubscriptionRequest = {
      assets_ids: [...this.subscribedAssets],
      type: 'market',
      custom_feature_enabled: true,
    };

    this.send(payload);
  }

  private subscribeAssets(assetIds: string[]): void {
    const newAssets = assetIds.filter(
      (assetId) => !this.subscribedAssets.has(assetId),
    );
    newAssets.forEach((assetId) => this.subscribedAssets.add(assetId));

    if (newAssets.length === 0) {
      return;
    }
    this.logger.log(`Subscribing upstream to ${newAssets.length} new assets`);

    const payload: SubscriptionUpdateRequest = {
      operation: 'subscribe',
      assets_ids: newAssets,
    };
    this.send(payload);
  }

  private unsubscribeAssets(assetIds: string[]): void {
    const existingAssets = assetIds.filter((assetId) =>
      this.subscribedAssets.has(assetId),
    );
    existingAssets.forEach((assetId) => this.subscribedAssets.delete(assetId));

    if (existingAssets.length === 0) {
      return;
    }
    this.logger.log(
      `Unsubscribing upstream from ${existingAssets.length} assets`,
    );

    const payload: SubscriptionUpdateRequest = {
      operation: 'unsubscribe',
      assets_ids: existingAssets,
    };
    this.send(payload);
  }

  private send(payload: SubscriptionRequest | SubscriptionUpdateRequest): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify(payload));
  }

  private handleMessage(rawMessage: string): void {
    if (rawMessage === 'PONG') {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawMessage);
    } catch {
      return;
    }

    if (!parsed || typeof parsed !== 'object') {
      return;
    }

    const eventPayload = parsed as MarketEvent;
    const eventType = eventPayload['event_type'];
    if (eventType === 'last_trade_price') {
      const assetId = this.getStringField(eventPayload, 'asset_id');
      const price = Number(eventPayload['price']);
      if (assetId && Number.isFinite(price)) {
        this.latestPrices.set(assetId, price);
        this.emitToAsset(assetId, {
          assetId,
          currentPrice: price,
          stale: false,
        });
      }
      return;
    }

    if (eventType === 'best_bid_ask') {
      const assetId = this.getStringField(eventPayload, 'asset_id');
      const bid = Number(eventPayload['best_bid']);
      const ask = Number(eventPayload['best_ask']);

      if (!assetId || !Number.isFinite(bid) || !Number.isFinite(ask)) {
        return;
      }

      const mid = (bid + ask) / 2;
      this.latestPrices.set(assetId, mid);
      this.emitToAsset(assetId, { assetId, currentPrice: mid, stale: false });
    }
  }

  private emitToAsset(assetId: string, update: MarketPriceUpdate): void {
    const assetListeners = this.listeners.get(assetId);
    if (!assetListeners) {
      return;
    }

    assetListeners.forEach((listener) => listener(update));
  }

  private markAllAssetsStale(): void {
    const uniqueListeners = new Set<PriceListener>();
    this.listeners.forEach((assetListeners) => {
      assetListeners.forEach((listener) => uniqueListeners.add(listener));
    });

    uniqueListeners.forEach((listener) => listener({ stale: true }));
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.listeners.size === 0) {
      return;
    }

    const delay = PolymarketMarketStreamService.getReconnectDelayMs(
      this.reconnectAttempt,
    );
    this.reconnectAttempt += 1;
    this.logger.warn(
      `Scheduling upstream reconnect attempt ${this.reconnectAttempt} in ${delay}ms`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectIfNeeded();
    }, delay);
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send('PING');
      }
    }, 10000);
  }

  private clearHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private getStringField(payload: MarketEvent, key: string): string {
    const value = payload[key];
    return typeof value === 'string' ? value : '';
  }
}
