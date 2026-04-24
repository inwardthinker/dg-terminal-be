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
    walletAddress: string,
    username?: string,
  ): Promise<UserSessionResponse> {
    const profile = await this.userProfileRepository.ensureOnAuth(
      walletAddress,
      username,
    );
    return this.toSessionResponse(
      profile.onboarding_complete,
      profile.last_onboarding_step,
    );
  }

  async updateOnboardingStep(
    walletAddress: string,
    step: OnboardingStep,
    username?: string,
  ): Promise<UserSessionResponse> {
    const profile = await this.userProfileRepository.updateOnboardingStep(
      walletAddress,
      step,
      username,
    );
    return this.toSessionResponse(
      profile.onboarding_complete,
      profile.last_onboarding_step,
    );
  }

  async getSession(walletAddress: string): Promise<UserSessionResponse> {
    const profile =
      await this.userProfileRepository.findByWalletAddress(walletAddress);
    if (!profile) {
      return this.toSessionResponse(false, 'auth');
    }

    return this.toSessionResponse(
      profile.onboarding_complete,
      profile.last_onboarding_step,
    );
  }

  private toSessionResponse(
    onboardingComplete: boolean,
    step: OnboardingStep,
  ): UserSessionResponse {
    return {
      onboarding_complete: onboardingComplete,
      last_onboarding_step: step,
      onboarding_hash: onboardingComplete
        ? null
        : ONBOARDING_STEP_HASH_MAP[step],
    };
  }
}
