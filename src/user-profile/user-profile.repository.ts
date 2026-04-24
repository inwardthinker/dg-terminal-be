import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.constants';
import { OnboardingStep } from './types/onboarding-step.type';
import { UserProfile } from './types/user-profile.type';

/** Quoted so PostgreSQL keeps mixed-case table name `DGTerminal_UserProfile`. */
const USER_PROFILE_TABLE = '"DGTerminal_UserProfile"';

@Injectable()
export class UserProfileRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async ensureOnAuth(
    userId: string,
    username?: string,
    walletAddress?: string,
  ): Promise<UserProfile> {
    const { rows } = await this.pool.query<UserProfile>(
      `
        INSERT INTO ${USER_PROFILE_TABLE} (
          user_id,
          username,
          wallet_address,
          onboarding_complete,
          last_onboarding_step
        )
        VALUES ($1, $2, $3, FALSE, 'auth')
        ON CONFLICT (user_id)
        DO UPDATE SET
          username = COALESCE(EXCLUDED.username, ${USER_PROFILE_TABLE}.username),
          wallet_address = COALESCE(EXCLUDED.wallet_address, ${USER_PROFILE_TABLE}.wallet_address),
          updated_at = NOW()
        RETURNING *
      `,
      [userId, username ?? null, walletAddress ?? null],
    );

    return rows[0];
  }

  async updateOnboardingStep(
    userId: string,
    step: OnboardingStep,
    username?: string,
  ): Promise<UserProfile> {
    const onboardingComplete = step === 'done';
    const { rows } = await this.pool.query<UserProfile>(
      `
        INSERT INTO ${USER_PROFILE_TABLE} (
          user_id,
          username,
          onboarding_complete,
          last_onboarding_step
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id)
        DO UPDATE SET
          onboarding_complete = EXCLUDED.onboarding_complete,
          last_onboarding_step = EXCLUDED.last_onboarding_step,
          username = COALESCE(EXCLUDED.username, ${USER_PROFILE_TABLE}.username),
          updated_at = NOW()
        RETURNING *
      `,
      [userId, username ?? null, onboardingComplete, step],
    );

    return rows[0];
  }

  async findByUserId(userId: string): Promise<UserProfile | null> {
    const { rows } = await this.pool.query<UserProfile>(
      `
        SELECT
          user_id,
          username,
          wallet_address,
          onboarding_complete,
          last_onboarding_step,
          created_at,
          updated_at
        FROM ${USER_PROFILE_TABLE}
        WHERE user_id = $1
      `,
      [userId],
    );

    return rows[0] ?? null;
  }
}
