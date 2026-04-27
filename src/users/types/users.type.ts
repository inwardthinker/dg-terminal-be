import { OnboardingStep } from './onboarding-step.type';

export type UserRecord = {
  id: string;
  email: string | null;
  username: string | null;
  safe_wallet_address: string | null;
  onboarding_complete: boolean;
  last_onboarding_step: OnboardingStep;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
};

export type UsersSessionResponse = {
  onboarding_complete: boolean;
  last_onboarding_step: OnboardingStep;
  onboarding_hash: string | null;
  existing_user: boolean;
  legacy_username: string | null;
  user: UserRecord | null;
};
