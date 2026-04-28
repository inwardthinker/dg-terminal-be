import { Injectable } from '@nestjs/common';
import {
  ONBOARDING_STEP_HASH_MAP,
  OnboardingStep,
} from './types/onboarding-step.type';
import { UsersSessionResponse } from './types/users.type';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async onAuth(
    userId: string,
    email?: string,
    username?: string,
    walletAddress?: string,
  ): Promise<UsersSessionResponse> {
    const existingUser = await this.resolveExistingUserByEmail(email, userId);
    const user = await this.usersRepository.ensureOnAuth(
      userId,
      email,
      username,
      walletAddress,
    );

    return this.toSessionResponse(
      user?.onboarding_complete ?? false,
      user?.last_onboarding_step ?? 'auth',
      existingUser.exists,
      existingUser.legacyUsername,
      user,
    );
  }

  async updateOnboardingStep(
    userId: string,
    step: OnboardingStep,
    username?: string,
  ): Promise<UsersSessionResponse> {
    const user = await this.usersRepository.updateOnboardingStep(
      userId,
      step,
      username,
    );
    return this.toSessionResponse(
      user?.onboarding_complete ?? false,
      user?.last_onboarding_step ?? 'auth',
      false,
      null,
      user,
    );
  }

  async getSession(userId: string): Promise<UsersSessionResponse> {
    const user = await this.usersRepository.findByUserId(userId);
    if (!user) {
      return this.toSessionResponse(false, 'auth', false, null, null);
    }

    return this.toSessionResponse(
      user.onboarding_complete,
      user.last_onboarding_step,
      false,
      null,
      user,
    );
  }

  private toSessionResponse(
    onboardingComplete: boolean,
    step: OnboardingStep,
    existingUser: boolean,
    legacyUsername: string | null,
    user: UsersSessionResponse['user'],
  ): UsersSessionResponse {
    return {
      onboarding_complete: onboardingComplete,
      last_onboarding_step: step,
      onboarding_hash: onboardingComplete
        ? null
        : ONBOARDING_STEP_HASH_MAP[step],
      existing_user: existingUser,
      legacy_username: legacyUsername,
      user,
    };
  }

  private async resolveExistingUserByEmail(
    email?: string,
    userId?: string,
  ): Promise<{ exists: boolean; legacyUsername: string | null }> {
    if (!email) {
      return { exists: false, legacyUsername: null };
    }

    try {
      const legacyUser = await this.usersRepository.findLegacyUserByEmail(
        email,
        userId,
      );
      return {
        exists: !!legacyUser,
        legacyUsername: legacyUser?.username ?? null,
      };
    } catch {
      return { exists: false, legacyUsername: null };
    }
  }
}
