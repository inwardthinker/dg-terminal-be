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
    walletAddress: string,
    username?: string,
  ): Promise<UserProfile> {
    const { rows } = await this.pool.query<UserProfile>(
      `
        INSERT INTO ${USER_PROFILE_TABLE} (
          wallet_address,
          username,
          onboarding_complete,
          last_onboarding_step
        )
        VALUES ($1, $2, FALSE, 'auth')
        ON CONFLICT (wallet_address)
        DO UPDATE SET
          username = COALESCE(EXCLUDED.username, ${USER_PROFILE_TABLE}.username),
          updated_at = NOW()
        RETURNING *
      `,
      [walletAddress, username ?? null],
    );

    return rows[0];
  }

  async updateOnboardingStep(
    walletAddress: string,
    step: OnboardingStep,
    username?: string,
  ): Promise<UserProfile> {
    const onboardingComplete = step === 'done';
    const { rows } = await this.pool.query<UserProfile>(
      `
        INSERT INTO ${USER_PROFILE_TABLE} (
          wallet_address,
          username,
          onboarding_complete,
          last_onboarding_step
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (wallet_address)
        DO UPDATE SET
          onboarding_complete = EXCLUDED.onboarding_complete,
          last_onboarding_step = EXCLUDED.last_onboarding_step,
          username = COALESCE(EXCLUDED.username, ${USER_PROFILE_TABLE}.username),
          updated_at = NOW()
        RETURNING *
      `,
      [walletAddress, username ?? null, onboardingComplete, step],
    );

    return rows[0];
  }

  async findByWalletAddress(
    walletAddress: string,
  ): Promise<UserProfile | null> {
    const { rows } = await this.pool.query<UserProfile>(
      `
        SELECT
          wallet_address,
          username,
          onboarding_complete,
          last_onboarding_step,
          created_at,
          updated_at
        FROM ${USER_PROFILE_TABLE}
        WHERE wallet_address = $1
      `,
      [walletAddress],
    );

    return rows[0] ?? null;
  }
}
