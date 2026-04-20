import { Pool } from 'pg';
import { WorkerConfig } from './config';

export class WorkerDb {
  readonly pool: Pool;

  constructor(config: WorkerConfig) {
    this.pool = new Pool({
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: config.db.user,
      password: config.db.password,
      ssl: { rejectUnauthorized: false },
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getWalletUsers(): Promise<Array<{ userId: number; wallet: string }>> {
    const result = await this.pool.query<{
      user_id: number | null;
      safe_wallet_address: string | null;
    }>(
      `
      SELECT
        id AS user_id,
        safe_wallet_address
      FROM users
      WHERE id IS NOT NULL
        AND safe_wallet_address IS NOT NULL
      `,
    );
    return result.rows
      .filter((row) => row.user_id !== null && !!row.safe_wallet_address)
      .map((row) => ({
        userId: row.user_id as number,
        wallet: row.safe_wallet_address as string,
      }));
  }

  async upsertPositions(rows: PositionUpsertRow[]): Promise<void> {
    if (rows.length === 0) return;
    const sortedRows = [...rows].sort((a, b) => {
      const walletCompare = a.proxyWallet.localeCompare(b.proxyWallet);
      if (walletCompare !== 0) return walletCompare;
      return a.asset.localeCompare(b.asset);
    });

    await this.withDeadlockRetry(async () => {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        for (const row of sortedRows) {
          await client.query(
            `
          INSERT INTO positions (
            user_id, proxy_wallet, asset, condition_id, market_name, category, venue, side,
            icon, end_date, redeemable, shares, avg_entry_price, cost_basis, current_price,
            unrealized_pnl, unrealized_pnl_pct, fair_value, fair_value_updated_at, last_rest_sync,
            last_updated, updated_at, slug, event_id, event_slug, outcome_index, opposite_outcome,
            opposite_asset, mergeable, negative_risk, total_bought, realized_pnl, percent_realized_pnl,
            initial_value, current_value, percent_pnl
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,
            $9,$10,$11,$12,$13,$14,$15,
            $16,$17,$18,$19,$20,
            NOW(),NOW(),$21,$22,$23,$24,$25,
            $26,$27,$28,$29,$30,$31,
            $32,$33,$34
          )
          ON CONFLICT (proxy_wallet, asset) DO UPDATE SET
            market_name = EXCLUDED.market_name,
            category = EXCLUDED.category,
            venue = EXCLUDED.venue,
            side = EXCLUDED.side,
            icon = EXCLUDED.icon,
            end_date = EXCLUDED.end_date,
            redeemable = EXCLUDED.redeemable,
            shares = EXCLUDED.shares,
            avg_entry_price = EXCLUDED.avg_entry_price,
            cost_basis = EXCLUDED.cost_basis,
            current_price = EXCLUDED.current_price,
            unrealized_pnl = EXCLUDED.unrealized_pnl,
            unrealized_pnl_pct = EXCLUDED.unrealized_pnl_pct,
            last_rest_sync = EXCLUDED.last_rest_sync,
            last_updated = NOW(),
            updated_at = NOW(),
            slug = EXCLUDED.slug,
            event_id = EXCLUDED.event_id,
            event_slug = EXCLUDED.event_slug,
            outcome_index = EXCLUDED.outcome_index,
            opposite_outcome = EXCLUDED.opposite_outcome,
            opposite_asset = EXCLUDED.opposite_asset,
            mergeable = EXCLUDED.mergeable,
            negative_risk = EXCLUDED.negative_risk,
            total_bought = EXCLUDED.total_bought,
            realized_pnl = EXCLUDED.realized_pnl,
            percent_realized_pnl = EXCLUDED.percent_realized_pnl,
            initial_value = EXCLUDED.initial_value,
            current_value = EXCLUDED.current_value,
            percent_pnl = EXCLUDED.percent_pnl
          `,
            [
              row.userId,
              row.proxyWallet,
              row.asset,
              row.conditionId,
              row.marketName,
              row.category,
              'Polymarket',
              row.side,
              row.icon,
              row.endDate,
              row.redeemable,
              row.shares,
              row.avgEntryPrice,
              row.costBasis,
              row.currentPrice,
              row.unrealizedPnl,
              row.unrealizedPnlPct,
              null,
              null,
              new Date(),
              row.slug,
              row.eventId,
              row.eventSlug,
              row.outcomeIndex,
              row.oppositeOutcome,
              row.oppositeAsset,
              row.mergeable,
              row.negativeRisk,
              row.totalBought,
              row.realizedPnl,
              row.percentRealizedPnl,
              row.initialValue,
              row.currentValue,
              row.percentPnl,
            ],
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }, 'upsertPositions');
  }

  async deletePositionOrphans(wallet: string, assets: string[]): Promise<void> {
    await this.withDeadlockRetry(async () => {
      if (assets.length === 0) {
        await this.pool.query('DELETE FROM positions WHERE proxy_wallet = $1', [
          wallet,
        ]);
        return;
      }
      await this.pool.query(
        'DELETE FROM positions WHERE proxy_wallet = $1 AND asset != ALL($2::text[])',
        [wallet, assets],
      );
    }, 'deletePositionOrphans');
  }

  async upsertTradeHistory(rows: TradeHistoryUpsertRow[]): Promise<void> {
    if (rows.length === 0) return;
    await this.withDeadlockRetry(async () => {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        for (const row of rows) {
          await client.query(
            `
        INSERT INTO trade_history (
            user_id, proxy_wallet, trade_id, trade_time, market_name, side, venue, category,
            entry_price, exit_price, cost_basis, shares, outcome, realized_pnl, rewards_earned,
            is_settlement, is_manual_close, last_sync, updated_at, asset, condition_id, slug, icon,
            event_id, event_slug, outcome_index, opposite_outcome, opposite_asset
          ) VALUES (
            $1,$2,$3,$4,$5,$6,'Polymarket',$7,
            $8,$9,$10,$11,$12,$13,$14,
            $15,$16,NOW(),NOW(),$17,$18,$19,$20,
            $21,$22,$23,$24,$25
          )
          ON CONFLICT (user_id, trade_id) DO UPDATE SET
            trade_time = EXCLUDED.trade_time,
            market_name = EXCLUDED.market_name,
            side = EXCLUDED.side,
            category = EXCLUDED.category,
            entry_price = EXCLUDED.entry_price,
            exit_price = EXCLUDED.exit_price,
            cost_basis = EXCLUDED.cost_basis,
            shares = EXCLUDED.shares,
            outcome = EXCLUDED.outcome,
            realized_pnl = EXCLUDED.realized_pnl,
            rewards_earned = EXCLUDED.rewards_earned,
            is_settlement = EXCLUDED.is_settlement,
            is_manual_close = EXCLUDED.is_manual_close,
            last_sync = NOW(),
            updated_at = NOW(),
            asset = EXCLUDED.asset,
            condition_id = EXCLUDED.condition_id,
            slug = EXCLUDED.slug,
            icon = EXCLUDED.icon,
            event_id = EXCLUDED.event_id,
            event_slug = EXCLUDED.event_slug,
            outcome_index = EXCLUDED.outcome_index,
            opposite_outcome = EXCLUDED.opposite_outcome,
            opposite_asset = EXCLUDED.opposite_asset
          `,
            [
              row.userId,
              row.proxyWallet,
              row.tradeId,
              row.tradeTime,
              row.marketName,
              row.side,
              row.category,
              row.entryPrice,
              row.exitPrice,
              row.costBasis,
              row.shares,
              row.outcome,
              row.realizedPnl,
              row.rewardsEarned,
              row.isSettlement,
              row.isManualClose,
              row.asset,
              row.conditionId,
              row.slug,
              row.icon,
              row.eventId,
              row.eventSlug,
              row.outcomeIndex,
              row.oppositeOutcome,
              row.oppositeAsset,
            ],
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }, 'upsertTradeHistory');
  }

  async updatePositionPricePatch(
    wallet: string,
    asset: string,
    currentPrice: number,
    unrealizedPnl: number,
    unrealizedPnlPct: number,
  ): Promise<void> {
    await this.withDeadlockRetry(async () => {
      await this.pool.query(
        `
        UPDATE positions
        SET current_price = $3,
            unrealized_pnl = $4,
            unrealized_pnl_pct = $5,
            last_ws_update = NOW(),
            last_updated = NOW(),
            updated_at = NOW()
        WHERE proxy_wallet = $1 AND asset = $2
        `,
        [wallet, asset, currentPrice, unrealizedPnl, unrealizedPnlPct],
      );
    }, 'updatePositionPricePatch');
  }

  private async withDeadlockRetry<T>(
    fn: () => Promise<T>,
    context: string,
    maxRetries = 4,
  ): Promise<T> {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        return await fn();
      } catch (error) {
        const pgCode = getPgErrorCode(error);
        const retryable = pgCode === '40P01' || pgCode === '40001';
        if (!retryable || attempt >= maxRetries) {
          throw error;
        }
        attempt += 1;
        const backoffMs = 100 * 2 ** attempt + Math.floor(Math.random() * 100);
        // eslint-disable-next-line no-console
        console.warn(
          `[${context}] retrying after ${pgCode} (attempt ${attempt}/${maxRetries}) in ${backoffMs}ms`,
        );
        await sleep(backoffMs);
      }
    }
  }
}

function getPgErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const maybeCode = (error as { code?: unknown }).code;
  return typeof maybeCode === 'string' ? maybeCode : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export type PositionUpsertRow = {
  userId: number;
  proxyWallet: string;
  asset: string;
  conditionId: string;
  marketName: string;
  category: string;
  side: 'YES' | 'NO';
  icon: string;
  endDate: Date | null;
  redeemable: boolean;
  shares: number;
  avgEntryPrice: number;
  costBasis: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  slug: string;
  eventId: string;
  eventSlug: string;
  outcomeIndex: number;
  oppositeOutcome: string;
  oppositeAsset: string;
  mergeable: boolean;
  negativeRisk: boolean;
  totalBought: number;
  realizedPnl: number;
  percentRealizedPnl: number;
  initialValue: number;
  currentValue: number;
  percentPnl: number;
};

export type TradeHistoryUpsertRow = {
  userId: number;
  proxyWallet: string;
  tradeId: string;
  tradeTime: Date;
  marketName: string;
  side: 'YES' | 'NO';
  category: string;
  entryPrice: number;
  exitPrice: number;
  costBasis: number;
  shares: number;
  outcome: 'WON' | 'LOST' | 'PUSHED';
  realizedPnl: number;
  rewardsEarned: number;
  isSettlement: boolean;
  isManualClose: boolean;
  asset: string;
  conditionId: string;
  slug: string;
  icon: string;
  eventId: string;
  eventSlug: string;
  outcomeIndex: number;
  oppositeOutcome: string;
  oppositeAsset: string;
};
