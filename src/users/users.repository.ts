import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.constants';
import { OnboardingStep } from './types/onboarding-step.type';
import { UserInterestSelection, UserRecord } from './types/users.type';

const USERS_TABLE = 'public."DG3_user"';

@Injectable()
export class UsersRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findLegacyUserByEmail(
    email: string,
    excludeUserId?: string,
  ): Promise<{ username: string | null } | null> {
    const { rows } = await this.pool.query<{ username: string | null }>(
      `
        SELECT username
        FROM ${USERS_TABLE}
        WHERE LOWER(email) = LOWER($1)
          AND ($2::text IS NULL OR user_id IS DISTINCT FROM $2)
        LIMIT 1
      `,
      [email, excludeUserId ?? null],
    );

    return rows[0] ?? null;
  }

  async ensureOnAuth(
    userId: string,
    email?: string | null,
    username?: string,
    walletAddress?: string,
  ): Promise<UserRecord | null> {
    const { rows } = await this.pool.query<UserRecord>(
      `
        WITH updated AS (
          UPDATE ${USERS_TABLE}
          SET
            email = COALESCE($2, email),
            username = COALESCE($3, username),
            wallet_address = COALESCE(NULLIF($4, ''), wallet_address),
            onboarding_complete = COALESCE(onboarding_complete, FALSE),
            last_onboarding_step = COALESCE(last_onboarding_step, 'auth'),
            updated_at = NOW()
          WHERE user_id = $1
          RETURNING *
        ),
        inserted AS (
          INSERT INTO ${USERS_TABLE} (
            user_id,
            email,
            username,
            wallet_address,
            onboarding_complete,
            last_onboarding_step,
            updated_at
          )
          SELECT
            $1,
            $2,
            $3,
            $4,
            FALSE,
            'auth',
            NOW()
          WHERE NOT EXISTS (SELECT 1 FROM updated)
          RETURNING *
        )
        SELECT * FROM updated
        UNION ALL
        SELECT * FROM inserted
      `,
      [userId, email ?? null, username ?? null, walletAddress ?? ''],
    );

    return rows[0] ?? null;
  }

  async updateOnboardingStep(
    userId: string,
    step: OnboardingStep,
    username?: string,
  ): Promise<UserRecord | null> {
    const onboardingComplete = step === 'done';
    const { rows } = await this.pool.query<UserRecord>(
      `
        UPDATE ${USERS_TABLE}
        SET
          onboarding_complete = $2,
          last_onboarding_step = $3,
          username = COALESCE($4, username),
          updated_at = NOW()
        WHERE user_id = $1
        RETURNING *
      `,
      [userId, onboardingComplete, step, username ?? null],
    );

    return rows[0] ?? null;
  }

  async replaceUserInterests(
    userId: string,
    selections: UserInterestSelection[],
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'DELETE FROM public.dg3_user_interests WHERE user_id = $1',
        [userId],
      );

      for (const selection of selections) {
        await client.query(
          `
            INSERT INTO public.dg3_user_interests (user_id, stream_id, markets, created_at, updated_at)
            VALUES ($1, $2, $3::jsonb, NOW(), NOW())
          `,
          [userId, selection.stream, JSON.stringify(selection.markets)],
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async completeOnboarding(
    userId: string,
    username?: string,
  ): Promise<UserRecord | null> {
    const { rows } = await this.pool.query<UserRecord>(
      `
        UPDATE ${USERS_TABLE}
        SET
          onboarding_complete = TRUE,
          last_onboarding_step = 'done',
          completed_at = NOW(),
          username = COALESCE($2, username),
          updated_at = NOW()
        WHERE user_id = $1
        RETURNING *
      `,
      [userId, username ?? null],
    );

    return rows[0] ?? null;
  }

  async findByUserId(userId: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query<UserRecord>(
      `
        SELECT *
        FROM ${USERS_TABLE}
        WHERE user_id = $1
      `,
      [userId],
    );

    return rows[0] ?? null;
  }
}
