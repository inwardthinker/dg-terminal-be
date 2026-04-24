export const ONBOARDING_STEPS = [
  'auth',
  'identity',
  'calibrate',
  'done',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_STEP_HASH_MAP: Record<OnboardingStep, string> = {
  auth: '#step=auth',
  identity: '#step=identity',
  calibrate: '#step=calibrate',
  done: '#step=done',
};
