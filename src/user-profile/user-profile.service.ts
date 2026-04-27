import { Injectable } from '@nestjs/common';
import {
  ONBOARDING_STEP_HASH_MAP,
  OnboardingStep,
} from './types/onboarding-step.type';
import { UserSessionResponse } from './types/user-profile.type';
import { UserProfileRepository } from './user-profile.repository';

@Injectable()
export class UserProfileService {
  constructor(private readonly userProfileRepository: UserProfileRepository) {}

  async onAuth(
    userId: string,
    username?: string,
    walletAddress?: string,
    email?: string,
  ): Promise<UserSessionResponse> {
    const profile = await this.userProfileRepository.ensureOnAuth(
      userId,
      username,
      walletAddress,
    );
    const existingUser = await this.resolveExistingUserByEmail(email);

    return this.toSessionResponse(
      profile.onboarding_complete,
      profile.last_onboarding_step,
      existingUser.exists,
      existingUser.legacyUsername,
    );
  }

  async updateOnboardingStep(
    userId: string,
    step: OnboardingStep,
    username?: string,
  ): Promise<UserSessionResponse> {
    const profile = await this.userProfileRepository.updateOnboardingStep(
      userId,
      step,
      username,
    );
    return this.toSessionResponse(
      profile.onboarding_complete,
      profile.last_onboarding_step,
      false,
      null,
    );
  }

  async getSession(userId: string): Promise<UserSessionResponse> {
    const profile = await this.userProfileRepository.findByUserId(userId);
    if (!profile) {
      return this.toSessionResponse(false, 'auth', false, null);
    }

    return this.toSessionResponse(
      profile.onboarding_complete,
      profile.last_onboarding_step,
      false,
      null,
    );
  }

  private toSessionResponse(
    onboardingComplete: boolean,
    step: OnboardingStep,
    existingUser: boolean,
    legacyUsername: string | null,
  ): UserSessionResponse {
    return {
      onboarding_complete: onboardingComplete,
      last_onboarding_step: step,
      onboarding_hash: onboardingComplete
        ? null
        : ONBOARDING_STEP_HASH_MAP[step],
      existing_user: existingUser,
      legacy_username: legacyUsername,
    };
  }

  private async resolveExistingUserByEmail(
    email?: string,
  ): Promise<{ exists: boolean; legacyUsername: string | null }> {
    if (!email) {
      return { exists: false, legacyUsername: null };
    }

    try {
      const legacyUser =
        await this.userProfileRepository.findLegacyUserByEmail(email);
      return {
        exists: !!legacyUser,
        legacyUsername: legacyUser?.username ?? null,
      };
    } catch {
      return { exists: false, legacyUsername: null };
    }
  }
}
