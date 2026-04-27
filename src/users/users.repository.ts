import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.constants';
import { OnboardingStep } from './types/onboarding-step.type';
import { UserRecord } from './types/users.type';

@Injectable()
export class UsersRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findLegacyUserByEmail(
    email: string,
  ): Promise<{ username: string | null } | null> {
    const { rows } = await this.pool.query<{ username: string | null }>(
      `
        SELECT username
        FROM users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1
      `,
      [email],
    );

    return rows[0] ?? null;
  }

  async ensureOnAuth(
    userId: string,
    username?: string,
    walletAddress?: string,
  ): Promise<UserRecord | null> {
    const { rows } = await this.pool.query<UserRecord>(
      `
        WITH updated AS (
          UPDATE users
          SET
            username = COALESCE($2, username),
            safe_wallet_address = COALESCE($3, safe_wallet_address),
            onboarding_complete = COALESCE(onboarding_complete, FALSE),
            last_onboarding_step = COALESCE(last_onboarding_step, 'auth'),
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
        )
        SELECT * FROM updated
      `,
      [userId, username ?? null, walletAddress ?? null],
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
        WITH updated AS (
          UPDATE users
          SET
            onboarding_complete = $2,
            last_onboarding_step = $3,
            username = COALESCE($4, username),
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
        )
        SELECT * FROM updated
      `,
      [userId, onboardingComplete, step, username ?? null],
    );

    return rows[0] ?? null;
  }

  async findByUserId(userId: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query<UserRecord>(
      `
        SELECT *
        FROM users
        WHERE id = $1
      `,
      [userId],
    );

    return rows[0] ?? null;
  }
}
