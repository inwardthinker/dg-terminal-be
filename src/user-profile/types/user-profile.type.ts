import { OnboardingStep } from './onboarding-step.type';

export type UserProfile = {
  user_id: string;
  username: string | null;
  wallet_address: string | null;
  onboarding_complete: boolean;
  last_onboarding_step: OnboardingStep;
  created_at: string;
  updated_at: string;
};

export type UserSessionResponse = {
  onboarding_complete: boolean;
  last_onboarding_step: OnboardingStep;
  onboarding_hash: string | null;
};
