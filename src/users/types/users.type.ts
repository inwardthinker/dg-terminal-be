import { OnboardingStep } from './onboarding-step.type';

export type UserRecord = {
  id: string;
  user_id: string | null;
  email: string | null;
  username: string | null;
  wallet_address: string;
  onboarding_complete: boolean;
  last_onboarding_step: OnboardingStep;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
};

export type UserInterestSelection = {
  stream: string;
  markets: string[];
};

export type UsersSessionResponse = {
  user: (UserRecord & { existing_user: boolean }) | null;
};

export type UsernameAvailabilityReason =
  | 'taken'
  | 'reserved'
  | 'invalid_format';

export type UsernameAvailabilityResponse = {
  available: boolean;
  reason?: UsernameAvailabilityReason;
};
